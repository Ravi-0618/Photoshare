import {
  signIn,
  completeSignIn,
  getAccessToken,
  signOut
} from './auth.bundle.js';

const gallery = document.querySelector('#gallery');
const message = document.querySelector('#message');
const form = document.querySelector('#uploadForm');

const loginBtn = document.querySelector('#loginBtn');
const logoutBtn = document.querySelector('#logoutBtn');
const userStatus = document.querySelector('#userStatus');
const refreshBtn = document.querySelector('#refresh');
const createRoomBtn = document.querySelector('#createRoomBtn');
const joinRoomBtn = document.querySelector('#joinRoomBtn');
const joinRoomPanel = document.querySelector('#joinRoomPanel');
const joinRoomForm = document.querySelector('#joinRoomForm');
const inviteLinkInput = document.querySelector('#inviteLink');
const joinRoomMessage = document.querySelector('#joinRoomMessage');
const roomPanel = document.querySelector('#roomPanel');
const roomMessage = document.querySelector('#roomMessage');
const roomDetails = document.querySelector('#roomDetails');
const roomIdDisplay = document.querySelector('#roomId');
const roomExpiresDisplay = document.querySelector('#roomExpires');
const copyInviteBtn = document.querySelector('#copyInviteBtn');
const copyInviteMessage = document.querySelector('#copyInviteMessage');

let signedIn = false;
let currentInviteUrl = '';
let activeRoomId = null;

function saveActiveRoom(roomId) {
  activeRoomId = roomId;
  sessionStorage.setItem('activeRoomId', roomId);
}

function restoreActiveRoom() {
  activeRoomId = sessionStorage.getItem('activeRoomId');
}

function clearActiveRoom() {
  activeRoomId = null;
  sessionStorage.removeItem('activeRoomId');
}

// Read invitation details from the URL
const inviteParams = new URLSearchParams(window.location.search);

let pendingRoomId = inviteParams.get('room');
let pendingInviteToken = inviteParams.get('invite');

// Preserve invitation during the Cognito login redirect
if (pendingRoomId && pendingInviteToken) {
  sessionStorage.setItem('pendingRoomId', pendingRoomId);
  sessionStorage.setItem('pendingInviteToken', pendingInviteToken);
} else {
  pendingRoomId = sessionStorage.getItem('pendingRoomId');
  pendingInviteToken = sessionStorage.getItem('pendingInviteToken');
}

// Remove invitation details without deleting Cognito callback parameters
if (inviteParams.has('room') || inviteParams.has('invite')) {
  const cleanUrl = new URL(window.location.href);

  cleanUrl.searchParams.delete('room');
  cleanUrl.searchParams.delete('invite');

  window.history.replaceState(
    {},
    document.title,
    cleanUrl.pathname + cleanUrl.search + cleanUrl.hash
  );
}

function updateUI(isSignedIn, email = '') {
  signedIn = isSignedIn;

  loginBtn.hidden = isSignedIn;
  logoutBtn.hidden = !isSignedIn;
  document.querySelector('#uploadPanel').hidden = !isSignedIn;
  refreshBtn.disabled = !isSignedIn;
  roomPanel.hidden = !isSignedIn;

  if (!isSignedIn) {
  roomDetails.hidden = true;
  roomMessage.textContent = '';
  copyInviteMessage.textContent = '';
  currentInviteUrl = '';
  }
  userStatus.textContent = isSignedIn
    ? `Signed in${email ? ': ' + email : ''}`
    : 'Not signed in';

  if (!isSignedIn) {
    gallery.replaceChildren();
    gallery.textContent = 'Please sign in to view photos.';
  }
}

async function authenticatedFetch(url, options = {}) {
  const token = await getAccessToken();

  if (!token) {
    updateUI(false);
    throw new Error('Your session has expired. Please sign in.');
  }

  const headers = new Headers(options.headers);
  headers.set('Authorization', `Bearer ${token}`);

  const response = await fetch(url, {
    ...options,
    headers
  });

  if (response.status === 401) {
    updateUI(false);
    throw new Error('Your login session is invalid or expired.');
  }

  return response;
}

// Join a private room using an invitation link
async function joinPendingRoom() {
  if (!signedIn || !pendingRoomId || !pendingInviteToken) {
    return false;
  }

  const roomId = pendingRoomId;
  const inviteToken = pendingInviteToken;

  // Clear the pending invitation after capturing it
  pendingRoomId = null;
  pendingInviteToken = null;
  sessionStorage.removeItem('pendingRoomId');
  sessionStorage.removeItem('pendingInviteToken');
  roomMessage.textContent = 'Joining private room...';

  try {
    const response = await authenticatedFetch(
      `/api/rooms/${encodeURIComponent(roomId)}/join`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ inviteToken })
      }
    );

        const contentType = response.headers.get('content-type') || '';

    let result = {};

    if (contentType.includes('application/json')) {
    result = await response.json();
    }

    if (!response.ok) {
  if (response.status === 410) {
    throw new Error('This room has expired.');
  }

  if (response.status === 403) {
    throw new Error('This invitation is invalid or access was denied.');
  }

  throw new Error(result.error || 'Could not join this room.');
}

    saveActiveRoom(roomId);
    roomDetails.hidden = true;
    roomMessage.textContent = 'Successfully joined the private room!';

    await loadPhotos();
    return true;
  } catch (err) {
    roomMessage.textContent = 'Could not join room: ' + err.message;
  return false;
}
}

async function loadPhotos() {
  if (!signedIn) return;

  gallery.replaceChildren();

  try {
    if (!activeRoomId) {
    gallery.innerHTML = '<p>Create or join a room to view photos.</p>';
    return;
   }

   const response = await authenticatedFetch(
   `/api/rooms/${encodeURIComponent(activeRoomId)}/photos`
   );

    if (!response.ok) {
    if ([403, 404, 410].includes(response.status)) {
        clearActiveRoom();

        if (response.status === 410) {
        throw new Error('This room has expired. Please create or join another room.');
        }

        throw new Error('You do not have access to this room. Please create or join another room.');
      }

    throw new Error('Could not load photos. Please try again.');
    }

    const photos = await response.json();

    if (!photos.length) {
      gallery.textContent = 'No photos yet. Upload your first image!';
      gallery.className = 'gallery empty';
      return;
    }

    gallery.className = 'gallery';

// Keep track of the photos currently displayed
viewerPhotos = photos;

    for (const photo of photos) {
  const card = document.createElement('div');
  card.className = 'photo-card';

  const img = document.createElement('img');
  img.src = photo.url;
  img.alt = 'Uploaded photo';
  img.loading = 'lazy';

  // Open the photo in the full-screen viewer
  img.addEventListener('click', () => {
  viewerIndex = viewerPhotos.indexOf(photo);
  showViewerPhoto();
  photoViewer.hidden = false;
  document.body.style.overflow = 'hidden';
  viewerClose.focus();
});

  card.append(img);
  gallery.append(card);
}
  } catch (err) {
    gallery.textContent = err.message;
  }
}

// Mobile photo viewer navigation
let viewerPhotos = [];
let viewerIndex = 0;

const viewerCounter = document.getElementById('viewerCounter');
const viewerPrev = document.getElementById('viewerPrev');
const viewerNext = document.getElementById('viewerNext');
const viewerImageArea = document.querySelector('.viewer-image-area');

function showViewerPhoto() {
  if (!viewerPhotos.length) return;

  viewerImage.src = viewerPhotos[viewerIndex].url;
  viewerCounter.textContent =
    `${viewerIndex + 1} of ${viewerPhotos.length}`;
}

function changeViewerPhoto(direction) {
  if (!viewerPhotos.length) return;

  viewerIndex =
    (viewerIndex + direction + viewerPhotos.length) %
    viewerPhotos.length;

  showViewerPhoto();
}

viewerPrev.addEventListener('click', () => changeViewerPhoto(-1));
viewerNext.addEventListener('click', () => changeViewerPhoto(1));

// Swipe left or right on the photo
let touchStartX = 0;
let touchStartY = 0;

viewerImageArea.addEventListener('touchstart', (event) => {
  if (event.touches.length !== 1) return;

  touchStartX = event.touches[0].clientX;
  touchStartY = event.touches[0].clientY;
}, { passive: true });

viewerImageArea.addEventListener('touchend', (event) => {
  if (event.changedTouches.length !== 1) return;

  const deltaX = event.changedTouches[0].clientX - touchStartX;
  const deltaY = event.changedTouches[0].clientY - touchStartY;

  if (Math.abs(deltaX) > 50 &&
      Math.abs(deltaX) > Math.abs(deltaY)) {
    changeViewerPhoto(deltaX < 0 ? 1 : -1);
  }
}, { passive: true });

loginBtn.addEventListener('click', async () => {
  try {
    await signIn();
  } catch (err) {
    message.textContent = 'Could not start sign in: ' + err.message;
  }
});

logoutBtn.addEventListener('click', async () => {
  try {
    clearActiveRoom();
    await signOut();
  } catch (err) {
    message.textContent = 'Could not sign out: ' + err.message;
  }
});

form.addEventListener('submit', async event => {
  event.preventDefault();

  if (!signedIn) return;

  message.textContent = 'Uploading...';

  const button = form.querySelector('button');
  button.disabled = true;

  try {
    if (!activeRoomId) {
       throw new Error('Please create or join a room before uploading.');
     }
const files = Array.from(document.querySelector('#photo').files);

if (files.length === 0) {
  throw new Error('Please select at least one photo.');
}

if (files.length > 10) {
  throw new Error('You can upload a maximum of 10 photos at once.');
}

for (const file of files) {
  if (file.size > 10 * 1024 * 1024) {
    throw new Error(`${file.name} is larger than 10 MB.`);
  }

  const isHeic = /\.(heic|heif)$/i.test(file.name) ||
  ['image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence']
    .includes(file.type);

if (!isHeic &&
    !['image/jpeg', 'image/png', 'image/webp', 'image/gif']
      .includes(file.type)) {
  throw new Error(`${file.name} is not a supported image type.`);
}
}


const uploadData = new FormData();

for (const file of files) {
  uploadData.append('photo', file);
}

message.textContent = `Uploading ${files.length} photo(s)...`;


const response = await authenticatedFetch(
  `/api/rooms/${encodeURIComponent(activeRoomId)}/photos`,
  {
    method: 'POST',
    body: uploadData
  }
);

    const contentType = response.headers.get('content-type') || '';

    let result = {};

    if (contentType.includes('application/json')) {
    result = await response.json();
    }

    if (!response.ok) {
    if (response.status === 413) {
        throw new Error('Photo is too large. Maximum size is 10 MB.');
    }

    if (response.status === 410) {
        throw new Error('This room has expired. Please create a new room.');
    }

    throw new Error(result.error || 'Upload failed. Please try again.');
    }

    message.textContent =
  `${result.count} photo(s) uploaded successfully!`;
    form.reset();

    await loadPhotos();
  } catch (err) {
    message.textContent = err.message;
  } finally {
    button.disabled = false;
  }
});

joinRoomBtn.addEventListener('click', () => {
  if (!signedIn) {
    joinRoomMessage.textContent = 'Please sign in first.';
    return;
  }

  joinRoomPanel.hidden = !joinRoomPanel.hidden;

  if (!joinRoomPanel.hidden) {
    joinRoomMessage.textContent = '';
    inviteLinkInput.focus();
  }
});

joinRoomForm.addEventListener('submit', async event => {
  event.preventDefault();

  if (!signedIn) {
    joinRoomMessage.textContent = 'Please sign in first.';
    return;
  }

  const submitBtn = joinRoomForm.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  joinRoomMessage.textContent = 'Checking invitation link...';

  try {
    const url = new URL(inviteLinkInput.value.trim());

    if (url.origin !== window.location.origin) {
      throw new Error('Please use a PhotoShare invitation link.');
    }

    const roomId = url.searchParams.get('room');
    const inviteToken = url.searchParams.get('invite');

    if (!roomId || !inviteToken) {
      throw new Error('Invalid invitation link. Please copy the complete link.');
    }

    pendingRoomId = roomId;
    pendingInviteToken = inviteToken;

    const joined = await joinPendingRoom();

    if (joined) {
      joinRoomMessage.textContent = 'Successfully joined the room!';
      joinRoomPanel.hidden = true;
      joinRoomForm.reset();
    } else {
      joinRoomMessage.textContent = roomMessage.textContent;
    }
  } catch (err) {
    joinRoomMessage.textContent = err.message;
  } finally {
    submitBtn.disabled = false;
  }
});

createRoomBtn.addEventListener('click', async () => {
  if (!signedIn) return;

  createRoomBtn.disabled = true;
  roomMessage.textContent = 'Creating your room...';
  roomDetails.hidden = true;

  try {
    const response = await authenticatedFetch('/api/rooms', {
      method: 'POST'
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || 'Could not create room');
    }
    saveActiveRoom(result.roomId);
    roomIdDisplay.textContent = result.roomId;
    const inviteUrl = new URL(window.location.origin);
    inviteUrl.searchParams.set('room', result.roomId);
    inviteUrl.searchParams.set('invite', result.inviteToken);
    currentInviteUrl = inviteUrl.toString();
copyInviteMessage.textContent = '';
console.log('Invitation link generated:', Boolean(result.inviteToken));
    roomExpiresDisplay.textContent =
      new Date(result.expiresAt * 1000).toLocaleString();

    roomDetails.hidden = false;
    roomMessage.textContent = 'Room created successfully!';
  } catch (err) {
    roomMessage.textContent = err.message;
  } finally {
    createRoomBtn.disabled = false;
  }
});
copyInviteBtn.addEventListener('click', async () => {
  if (!signedIn || !currentInviteUrl) {
    copyInviteMessage.textContent = 'Create a room first.';
    return;
  }

  try {
    await navigator.clipboard.writeText(currentInviteUrl);
    copyInviteMessage.textContent = 'Invitation link copied!';
  } catch (err) {
    copyInviteMessage.textContent = 'Could not copy invitation link.';
  }
});
refreshBtn.addEventListener('click', loadPhotos);

async function initialize() {
  updateUI(false);
  message.textContent = 'Checking login session...';

  try {
    const user = await completeSignIn();
    const token = await getAccessToken();

    if (user && token) {
      updateUI(true, user.profile?.email || '');
      message.textContent = '';
      if (pendingRoomId && pendingInviteToken) {
    await joinPendingRoom();
    } else {
    restoreActiveRoom();
    await loadPhotos();
    }
    } else {
      updateUI(false);
      message.textContent = '';
    }
  } catch (err) {
    updateUI(false);
    message.textContent = 'Login error: ' + err.message;
  }
}



// Close the full-screen photo viewer
const photoViewer = document.getElementById('photoViewer');
const viewerClose = document.getElementById('viewerClose');
const viewerImage = document.getElementById('viewerImage');

function closePhotoViewer() {
  photoViewer.hidden = true;
  viewerImage.removeAttribute('src');
  document.body.style.overflow = '';
}

// Close when the X button is tapped
viewerClose.addEventListener('click', closePhotoViewer);

// Close when Escape is pressed
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !photoViewer.hidden) {
    closePhotoViewer();
  }
});


// Download the currently displayed photo
const viewerDownload = document.getElementById('viewerDownload');

viewerDownload.addEventListener('click', async () => {
  if (!viewerPhotos.length) return;

  const photo = viewerPhotos[viewerIndex];
  const originalText = viewerDownload.textContent;

  viewerDownload.disabled = true;
  viewerDownload.textContent = 'Preparing...';

  try {
    // Request fresh, authorized photo URLs
    const listResponse = await authenticatedFetch(
      `/api/rooms/${encodeURIComponent(activeRoomId)}/photos`,
      { cache: 'no-store' }
    );

    if (!listResponse.ok) {
      throw new Error(
        listResponse.status === 410
          ? 'This room has expired.'
          : 'Could not refresh photo access.'
      );
    }

    const freshPhotos = await listResponse.json();

    // Find the same photo, even if gallery order changes
    const freshPhoto = freshPhotos.find(
      item => item.name === photo.name
    );

    if (!freshPhoto) {
      throw new Error('This photo is no longer available.');
    }

    // Bypass stale browser-cached S3 responses
    const response = await fetch(freshPhoto.url, {
      cache: 'no-store',
      mode: 'cors'
    });

    if (!response.ok) {
      throw new Error(
        `Photo download failed (HTTP ${response.status}).`
      );
    }

    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = blobUrl;
    const extensions = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'image/gif': 'gif',
      'image/heic': 'heic',
      'image/heif': 'heif'
    };

    const mimeType = blob.type.split(';')[0].toLowerCase();
    const extension = extensions[mimeType] || 'bin';

    link.download = `PhotoShare-${viewerIndex + 1}.${extension}`;

    document.body.appendChild(link);
    link.click();
    link.remove();

    setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
  } catch (error) {
    console.error('Download failed:', error);
    alert('Could not download this photo. Please try again.');
  } finally {
    viewerDownload.disabled = false;
    viewerDownload.textContent = originalText;
  }
});
initialize();

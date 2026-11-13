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

let signedIn = false;

function updateUI(isSignedIn, email = '') {
  signedIn = isSignedIn;

  loginBtn.hidden = isSignedIn;
  logoutBtn.hidden = !isSignedIn;
  document.querySelector('#uploadPanel').hidden = !isSignedIn;
  refreshBtn.disabled = !isSignedIn;

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

async function loadPhotos() {
  if (!signedIn) return;

  gallery.replaceChildren();

  try {
    const response = await authenticatedFetch('/api/photos');

    if (!response.ok) {
      throw new Error('Could not load photos');
    }

    const photos = await response.json();

    if (!photos.length) {
      gallery.textContent = 'No photos yet. Upload your first image!';
      gallery.className = 'gallery empty';
      return;
    }

    gallery.className = 'gallery';

    for (const photo of photos) {
      const card = document.createElement('div');
      card.className = 'photo-card';

      const img = document.createElement('img');
      img.src = photo.url;
      img.alt = 'Uploaded photo';
      img.loading = 'lazy';

      card.append(img);
      gallery.append(card);
    }
  } catch (err) {
    gallery.textContent = err.message;
  }
}

loginBtn.addEventListener('click', async () => {
  try {
    await signIn();
  } catch (err) {
    message.textContent = 'Could not start sign in: ' + err.message;
  }
});

logoutBtn.addEventListener('click', async () => {
  try {
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
    const response = await authenticatedFetch('/api/photos', {
      method: 'POST',
      body: new FormData(form)
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || 'Upload failed');
    }

    message.textContent = 'Photo uploaded successfully!';
    form.reset();

    await loadPhotos();
  } catch (err) {
    message.textContent = err.message;
  } finally {
    button.disabled = false;
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
      await loadPhotos();
    } else {
      updateUI(false);
      message.textContent = '';
    }
  } catch (err) {
    updateUI(false);
    message.textContent = 'Login error: ' + err.message;
  }
}

initialize();

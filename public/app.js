const gallery = document.querySelector('#gallery');
const message = document.querySelector('#message');
const form = document.querySelector('#uploadForm');
async function loadPhotos() {
  gallery.replaceChildren();
  try {
    const response = await fetch('/api/photos');
    if (!response.ok) throw new Error('Could not load photos');
    const photos = await response.json();
    if (!photos.length) { gallery.textContent = 'No photos yet. Upload your first image!'; gallery.className = 'gallery empty'; return; }
    gallery.className = 'gallery';
    for (const photo of photos) {
      const card = document.createElement('div'); card.className = 'photo-card';
      const img = document.createElement('img'); img.src = photo.url; img.alt = 'Uploaded photo'; img.loading = 'lazy';
      card.append(img); gallery.append(card);
    }
  } catch (err) { gallery.textContent = err.message; }
}
form.addEventListener('submit', async event => {
  event.preventDefault();
  message.textContent = 'Uploading...';
  const button = form.querySelector('button'); button.disabled = true;
  try {
    const response = await fetch('/api/photos', { method: 'POST', body: new FormData(form) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Upload failed');
    message.textContent = 'Photo uploaded successfully!'; form.reset(); await loadPhotos();
  } catch (err) { message.textContent = err.message; }
  finally { button.disabled = false; }
});
document.querySelector('#refresh').addEventListener('click', loadPhotos);
loadPhotos();

const grantBtn = document.getElementById('grant') as HTMLButtonElement | null;
const statusEl = document.getElementById('status');

if (grantBtn && statusEl) {
  grantBtn.addEventListener('click', async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      stream.getTracks().forEach((t) => t.stop());
      statusEl.textContent = '✓ Permissions granted! You can close this tab and open the side panel from the toolbar.';
      statusEl.className = 'ok';
      grantBtn.disabled = true;
    } catch (e) {
      statusEl.textContent = '✗ Permission denied. Please allow camera and microphone and try again.';
      statusEl.style.color = '#ef4444';
    }
  });
}

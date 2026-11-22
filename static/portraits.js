for (const figure of document.querySelectorAll('.portrait-pair')) {
  const image = figure.querySelector('img');
  const link = figure.querySelector('a[data-motion-alt]');
  const still = { src: image.src, alt: image.alt };
  const play = document.createElement('button');
  play.type = 'button';
  play.textContent = 'Play animation';
  const status = document.createElement('span');
  status.setAttribute('role', 'status');
  const showStill = () => {
    image.onload = null;
    image.onerror = null;
    image.src = still.src;
    image.alt = still.alt;
    play.textContent = 'Play animation';
    status.textContent = '';
  };
  play.addEventListener('click', () => {
    if (image.src !== still.src) {
      showStill();
      return;
    }
    play.textContent = 'Show still';
    status.textContent = 'Loading animation…';
    image.onload = () => { status.textContent = ''; };
    image.onerror = () => {
      showStill();
      status.textContent = 'The animation could not load.';
    };
    image.alt = link.dataset.motionAlt;
    image.src = link.href;
  });
  link.before(play);
  link.after(status);
}

const STORAGE_KEY = 'biblioteka-oli-state-v1';
const DEFAULT_BOOK_URL = 'books/buszujacy-w-zbozu.txt';
const DEFAULT_BOOK_TITLE = 'Buszujący w zbożu';

const defaultState = {
  title: DEFAULT_BOOK_TITLE,
  content: '',
  currentPage: 1,
  totalPages: 1,
  mode: 'normal',
  fontSize: 21,
  brightness: 86,
  fontFamily: 'serif',
  timerMinutes: 25
};

const loveNotes = [
  'Olu, ta strona jest tylko nasza.',
  'Jeszcze jeden rozdzial, najspokojniej.',
  'Czytaj powoli. Ja wybieram Ciebie.',
  'Tu jest cicho, cieplo i po Twojemu.'
];

const elements = {};
let state = loadState();
let timerInterval = null;
let timerRemaining = state.timerMinutes * 60;
let resizeFrame = null;
let chapters = [];
let pageStep = 1;

window.addEventListener('DOMContentLoaded', () => {
  bindElements();
  bindEvents();
  loadDefaultBookIfNeeded().finally(() => {
    applyStateToControls();
    renderBook();
    updateTimerDisplay();
    refreshIcons();
    // Re-paginate once fonts and the full page have settled, otherwise the
    // first measurement can run against an unstyled/zero-size layout and the
    // text ends up positioned off-screen (only reappearing after a resize).
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => schedulePagination(state.currentPage));
    }
    window.addEventListener('load', () => schedulePagination(state.currentPage), { once: true });
  });
});

function bindElements() {
  const ids = [
    'appShell', 'menuButton', 'sidePanel', 'closePanelButton', 'bookTitle', 'bookFile',
    'clearBookButton', 'normalModeButton', 'loveModeButton', 'fontFamilySelect',
    'fontSizeRange', 'fontSizeValue', 'brightnessRange', 'brightnessValue', 'timerButton',
    'timerPanel', 'timerMinutes', 'startTimerButton', 'resetTimerButton', 'timerDisplay',
    'fullscreenButton', 'readerViewport', 'readerContent', 'emptyState', 'modeBadge',
    'progressLabel', 'prevPageButton', 'nextPageButton', 'pageRange', 'tocList', 'toast'
  ];

  ids.forEach((id) => {
    elements[id] = document.getElementById(id);
  });
}

function bindEvents() {
  elements.menuButton.addEventListener('click', openPanel);
  elements.closePanelButton.addEventListener('click', closePanel);
  document.addEventListener('click', closePanelFromBackdrop);

  elements.bookFile.addEventListener('change', handleBookUpload);
  elements.clearBookButton.addEventListener('click', clearBook);

  elements.normalModeButton.addEventListener('click', () => setMode('normal'));
  elements.loveModeButton.addEventListener('click', () => setMode('love'));

  elements.fontFamilySelect.addEventListener('change', (event) => {
    state.fontFamily = event.target.value;
    saveState();
    applyReaderSettings();
    schedulePagination(1);
  });

  elements.fontSizeRange.addEventListener('input', (event) => {
    state.fontSize = Number(event.target.value);
    elements.fontSizeValue.value = `${state.fontSize} px`;
    saveState();
    applyReaderSettings();
    schedulePagination(state.currentPage);
  });

  elements.brightnessRange.addEventListener('input', (event) => {
    state.brightness = Number(event.target.value);
    elements.brightnessValue.value = `${state.brightness}%`;
    saveState();
    applyReaderSettings();
  });

  elements.timerButton.addEventListener('click', () => {
    openPanel();
    elements.timerMinutes.focus();
  });

  elements.timerMinutes.addEventListener('change', (event) => {
    state.timerMinutes = clamp(Number(event.target.value) || 25, 1, 180);
    timerRemaining = state.timerMinutes * 60;
    event.target.value = state.timerMinutes;
    saveState();
    updateTimerDisplay();
  });

  elements.startTimerButton.addEventListener('click', toggleTimer);
  elements.resetTimerButton.addEventListener('click', resetTimer);
  elements.fullscreenButton.addEventListener('click', toggleFullscreen);

  elements.prevPageButton.addEventListener('click', () => goToPage(state.currentPage - 1));
  elements.nextPageButton.addEventListener('click', () => goToPage(state.currentPage + 1));
  elements.pageRange.addEventListener('input', (event) => goToPage(Number(event.target.value)));

  elements.readerViewport.addEventListener('keydown', handleReaderKeys);
  window.addEventListener('keydown', handleGlobalKeys);
  window.addEventListener('resize', () => schedulePagination(state.currentPage));
  document.addEventListener('fullscreenchange', refreshFullscreenIcon);

  // Re-paginate whenever the reader viewport actually gets (or changes) its
  // size. This is the reliable trigger: on first load the viewport starts at
  // zero height for a few frames, and this fires the moment layout settles,
  // as well as on rotation / fullscreen, so the text never stays blank.
  if (window.ResizeObserver) {
    const observer = new ResizeObserver(() => schedulePagination(state.currentPage));
    observer.observe(elements.readerViewport);
  }
}

function loadState() {
  try {
    return { ...defaultState, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') };
  } catch {
    return { ...defaultState };
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    showToast('Plik jest za duzy, aby zapisac go w tej przegladarce.');
  }
}

async function loadDefaultBookIfNeeded() {
  if (state.content.trim()) {
    return;
  }

  try {
    const response = await fetch(DEFAULT_BOOK_URL, { cache: 'no-cache' });

    if (!response.ok) {
      throw new Error('Default book not found');
    }

    state.content = await response.text();
    state.title = DEFAULT_BOOK_TITLE;
    state.currentPage = 1;
    state.totalPages = 1;
    saveState();
  } catch {
    state.title = DEFAULT_BOOK_TITLE;
  }
}

function applyStateToControls() {
  elements.bookTitle.textContent = state.title || DEFAULT_BOOK_TITLE;
  elements.fontSizeRange.value = state.fontSize;
  elements.fontSizeValue.value = `${state.fontSize} px`;
  elements.brightnessRange.value = state.brightness;
  elements.brightnessValue.value = `${state.brightness}%`;
  elements.fontFamilySelect.value = state.fontFamily;
  elements.timerMinutes.value = state.timerMinutes;
  applyReaderSettings();
  updateModeControls();
}

function applyReaderSettings() {
  const familyMap = {
    serif: "Georgia, 'Times New Roman', serif",
    sans: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    dyslexic: "Verdana, Atkinson Hyperlegible, ui-sans-serif, system-ui, sans-serif"
  };

  document.documentElement.style.setProperty('--reader-font-size', `${state.fontSize}px`);
  document.documentElement.style.setProperty('--brightness', String(state.brightness / 100));
  document.documentElement.style.setProperty('--reader-family', familyMap[state.fontFamily] || familyMap.serif);
}

function renderBook() {
  applyReaderSettings();
  document.body.classList.toggle('love-mode', state.mode === 'love');

  if (!state.content.trim()) {
    elements.readerContent.classList.remove('has-book');
    elements.readerContent.style.transform = 'translateX(0)';
    elements.readerContent.innerHTML = '';
    elements.readerContent.appendChild(elements.emptyState);
    state.currentPage = 1;
    state.totalPages = 1;
    updateProgress();
    renderToc();
    refreshIcons();
    return;
  }

  elements.readerContent.classList.add('has-book');
  elements.readerContent.innerHTML = formatBookContent(state.content);
  elements.bookTitle.textContent = state.title;
  refreshIcons();
  schedulePagination(state.currentPage);
}

function formatBookContent(text) {
  const blocks = prepareBookBlocks(text);
  chapters = [];

  if (!blocks.length) {
    return '<p></p>';
  }

  return blocks.map((block, index) => {
    const escaped = escapeHtml(block.text).replace(/\n/g, '<br>');

    if (block.type === 'title') {
      return `<h1 class="book-heading">${escaped}</h1>`;
    }

    if (block.type === 'chapter') {
      const chapter = {
        id: `chapter-${chapters.length + 1}`,
        title: block.text,
        page: 1
      };

      chapters.push(chapter);
      return `<h2 id="${chapter.id}" data-chapter-index="${chapters.length - 1}">${escaped}</h2>`;
    }

    return `<p>${escaped}</p>`;
  }).join('');
}

function prepareBookBlocks(text) {
  const lines = text
    .replace(/\r\n/g, '\n')
    .replace(/\f/g, '\n\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]{2,}/g, ' ').trim());

  const blocks = [];
  let paragraph = [];

  const pushParagraph = () => {
    const joined = paragraph.join(' ').replace(/\s+/g, ' ').trim();

    if (joined) {
      blocks.push({ type: 'paragraph', text: joined });
    }

    paragraph = [];
  };

  lines.forEach((line) => {
    if (!line) {
      pushParagraph();
      return;
    }

    if (/^#{1,3}\s+/.test(line)) {
      pushParagraph();
      blocks.push({ type: 'chapter', text: line.replace(/^#{1,3}\s+/, '') });
      return;
    }

    const chapterMatch = line.match(/^(\d{1,2})\.$/);

    if (chapterMatch) {
      pushParagraph();
      blocks.push({ type: 'chapter', text: `Rozdział ${chapterMatch[1]}` });
      return;
    }

    if (blocks.length < 2 && line.length < 70) {
      pushParagraph();
      blocks.push({ type: 'title', text: line });
      return;
    }

    paragraph.push(line);
  });

  pushParagraph();
  return blocks;
}

function schedulePagination(targetPage = state.currentPage) {
  clearTimeout(resizeFrame);
  // Debounce with a short timeout so a burst of ResizeObserver / resize events
  // coalesces into a single pagination pass once the layout has settled.
  resizeFrame = window.setTimeout(() => paginate(targetPage), 80);
}

function paginate(targetPage = state.currentPage, attempt = 0) {
  if (!state.content.trim()) {
    updateProgress();
    return;
  }

  const viewportWidth = elements.readerViewport.clientWidth;
  const viewportHeight = elements.readerViewport.clientHeight;

  if (!viewportWidth || !viewportHeight) {
    // Layout is not ready yet (zero-size viewport). Retry a few times instead
    // of bailing out silently, which used to leave the reader blank until the
    // user forced a resize / fullscreen.
    if (attempt < 30) {
      requestAnimationFrame(() => paginate(targetPage, attempt + 1));
    }
    return;
  }

  const styles = getComputedStyle(elements.readerContent);
  const horizontalPadding = parseFloat(styles.paddingLeft) + parseFloat(styles.paddingRight);
  const gap = Math.max(48, Math.round(viewportWidth * 0.08));
  const pageWidth = Math.max(260, viewportWidth - horizontalPadding);

  elements.readerContent.style.setProperty('--page-width', `${pageWidth}px`);
  elements.readerContent.style.columnGap = `${gap}px`;

  // Measure after a tick so the browser has finished laying out the new
  // multi-column width before we read scrollWidth (reading it too early
  // reports a single page for very long books).
  window.setTimeout(() => {
    const totalWidth = elements.readerContent.scrollWidth;
    pageStep = pageWidth + gap;
    state.totalPages = Math.max(1, Math.ceil((totalWidth + gap) / pageStep));
    updateChapterPages();
    goToPage(clamp(targetPage, 1, state.totalPages), false);
    updateProgress();
    renderToc();
    saveState();
  }, 60);
}

function goToPage(page, persist = true) {
  const nextPage = clamp(page, 1, state.totalPages || 1);
  state.currentPage = nextPage;

  const styles = getComputedStyle(elements.readerContent);
  const pageWidth = parseFloat(styles.getPropertyValue('--page-width')) || elements.readerViewport.clientWidth;
  const gap = parseFloat(styles.columnGap) || 0;
  const offset = (nextPage - 1) * (pageWidth + gap);

  elements.readerContent.style.transform = `translateX(${-offset}px)`;
  updateProgress();

  if (persist) {
    saveState();
  }
}

function updateProgress() {
  elements.pageRange.min = '1';
  elements.pageRange.max = String(state.totalPages || 1);
  elements.pageRange.value = String(state.currentPage || 1);
  elements.progressLabel.textContent = `Strona ${state.currentPage || 1} / ${state.totalPages || 1}`;
}

function updateChapterPages() {
  chapters = chapters.map((chapter, index) => {
    const heading = elements.readerContent.querySelector(`[data-chapter-index="${index}"]`);
    const page = heading ? clamp(Math.floor(heading.offsetLeft / pageStep) + 1, 1, state.totalPages) : 1;

    return { ...chapter, page };
  });
}

function renderToc() {
  if (!elements.tocList) {
    return;
  }

  if (!chapters.length) {
    elements.tocList.innerHTML = '<span class="toc-empty">Brak rozdziałów w pliku.</span>';
    return;
  }

  elements.tocList.innerHTML = chapters.map((chapter, index) => `
    <button type="button" data-chapter-target="${index}">
      <span>${escapeHtml(chapter.title)}</span>
      <small>str. ${chapter.page}</small>
    </button>
  `).join('');

  elements.tocList.querySelectorAll('[data-chapter-target]').forEach((button) => {
    button.addEventListener('click', () => {
      const chapter = chapters[Number(button.dataset.chapterTarget)];
      goToPage(chapter.page);
      closePanel();
    });
  });
}

function setMode(mode) {
  state.mode = mode;
  document.body.classList.toggle('love-mode', mode === 'love');
  updateModeControls();
  saveState();

  if (mode === 'love') {
    showToast(loveNotes[Math.floor(Math.random() * loveNotes.length)]);
  }
}

function updateModeControls() {
  const loveMode = state.mode === 'love';
  elements.normalModeButton.classList.toggle('active', !loveMode);
  elements.loveModeButton.classList.toggle('active', loveMode);
  elements.modeBadge.textContent = loveMode ? 'Tryb milosny' : 'Tryb normalny';
  document.body.classList.toggle('love-mode', loveMode);
}

function handleBookUpload(event) {
  const file = event.target.files?.[0];

  if (!file) {
    return;
  }

  const reader = new FileReader();

  reader.onload = () => {
    state.content = String(reader.result || '');
    state.title = cleanTitle(file.name);
    state.currentPage = 1;
    elements.bookTitle.textContent = state.title;
    saveState();
    renderBook();
    closePanel();
    showToast('Ksiazka zapisana w czytniku.');
  };

  reader.onerror = () => showToast('Nie udalo sie wczytac pliku.');
  reader.readAsText(file, 'utf-8');
  event.target.value = '';
}

async function clearBook() {
  state.content = '';
  state.title = defaultState.title;
  state.currentPage = 1;
  state.totalPages = 1;
  await loadDefaultBookIfNeeded();
  renderBook();
  showToast('Wrocono do ksiazki bazowej.');
}

function openPanel() {
  elements.sidePanel.classList.add('open');
  document.body.classList.add('panel-open');
  elements.menuButton.setAttribute('aria-expanded', 'true');
}

function closePanel() {
  elements.sidePanel.classList.remove('open');
  document.body.classList.remove('panel-open');
  elements.menuButton.setAttribute('aria-expanded', 'false');
}

function closePanelFromBackdrop(event) {
  if (!document.body.classList.contains('panel-open')) {
    return;
  }

  if (!elements.sidePanel.contains(event.target) && !elements.menuButton.contains(event.target)) {
    closePanel();
  }
}

function handleReaderKeys(event) {
  if (event.key === 'ArrowRight' || event.key === 'PageDown' || event.key === ' ') {
    event.preventDefault();
    goToPage(state.currentPage + 1);
  }

  if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
    event.preventDefault();
    goToPage(state.currentPage - 1);
  }
}

function handleGlobalKeys(event) {
  if (event.target.matches('input, select, textarea')) {
    return;
  }

  if (event.key === 'Escape') {
    closePanel();
  }

  if (event.key.toLowerCase() === 'f') {
    toggleFullscreen();
  }
}

function toggleTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
    elements.startTimerButton.innerHTML = '<i data-lucide="play"></i> Start';
    refreshIcons();
    return;
  }

  if (timerRemaining <= 0) {
    timerRemaining = state.timerMinutes * 60;
  }

  // Reflect the starting time immediately instead of waiting a second for the
  // first tick (otherwise, after finishing, the display stays stuck at 00:00).
  updateTimerDisplay();

  timerInterval = window.setInterval(() => {
    timerRemaining -= 1;
    updateTimerDisplay();

    if (timerRemaining <= 0) {
      clearInterval(timerInterval);
      timerInterval = null;
      elements.startTimerButton.innerHTML = '<i data-lucide="play"></i> Start';
      refreshIcons();
      showToast('Timer zakonczony. Czas na oddech.');
    }
  }, 1000);

  elements.startTimerButton.innerHTML = '<i data-lucide="pause"></i> Pauza';
  refreshIcons();
}

function resetTimer() {
  clearInterval(timerInterval);
  timerInterval = null;
  timerRemaining = state.timerMinutes * 60;
  elements.startTimerButton.innerHTML = '<i data-lucide="play"></i> Start';
  updateTimerDisplay();
  refreshIcons();
}

function updateTimerDisplay() {
  const minutes = Math.floor(timerRemaining / 60);
  const seconds = timerRemaining % 60;
  elements.timerDisplay.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

async function toggleFullscreen() {
  try {
    if (!document.fullscreenElement) {
      await elements.appShell.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  } catch {
    showToast('Przegladarka nie pozwolila wlaczyc pelnego ekranu.');
  }
}

function refreshFullscreenIcon() {
  elements.fullscreenButton.innerHTML = document.fullscreenElement
    ? '<i data-lucide="minimize"></i>'
    : '<i data-lucide="maximize"></i>';
  refreshIcons();
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add('show');
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(() => elements.toast.classList.remove('show'), 2600);
}

function cleanTitle(fileName) {
  return fileName
    .replace(/\.(txt|md)$/i, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || DEFAULT_BOOK_TITLE;
}

function escapeHtml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function refreshIcons() {
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

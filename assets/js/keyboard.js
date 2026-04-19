/**
 * Keyboard Navigation for Emacs Blog Theme
 * Full-screen buffer switching with split view support
 * Now with Evil mode (Vim keybindings) support!
 */

(function() {
  'use strict';

  // State
  let selectedIndex = 0;
  let focusedBuffer = 'list'; // 'list' or 'content'
  let splitMode = null; // null, 'horizontal', or 'vertical'
  let keySequence = '';
  let sequenceTimeout = null;
  let isScrollingProgrammatically = false; // Flag to prevent scroll handler during keyboard nav
  let evilMode = false; // Evil mode (Vim keybindings) toggle
  
  // Store the base URL (list page) for history navigation
  const baseUrl = window.location.pathname;
  const baseTitle = document.title;

  // DOM elements (initialized in init() after DOM is ready)
  let bufferContainer, articleList, bufferList, bufferContent, contentBody, articleContent, postsData, echoMessage, helpOverlay;

  /**
   * Show message in echo area
   */
  function showMessage(msg, type = 'info') {
    if (echoMessage) {
      echoMessage.textContent = msg;
      echoMessage.className = 'echo-message ' + type;
      
      // Clear after 3 seconds
      setTimeout(() => {
        updateEchoHint();
        echoMessage.className = 'echo-message';
      }, 3000);
    }
  }

  /**
   * Update echo area hint based on current state
   */
  function updateEchoHint() {
    if (!echoMessage) return;
    
    const modeLabel = evilMode ? '[Evil] ' : '';
    
    if (splitMode) {
      if (evilMode) {
        echoMessage.textContent = modeLabel + 'Ctrl-w w switch window, Ctrl-w c close, ? for help';
      } else {
        echoMessage.textContent = 'C-x o switch window, C-x 0 close window, ? for help';
      }
    } else if (focusedBuffer === 'list') {
      if (evilMode) {
        echoMessage.textContent = modeLabel + 'j/k to navigate, RET/l to open, ? for help';
      } else {
        echoMessage.textContent = 'n/p to navigate, RET to open, C-x 3 split, ? for help';
      }
    } else {
      if (evilMode) {
        echoMessage.textContent = modeLabel + 'j/k scroll, n/N next/prev article, q to go back';
      } else {
        echoMessage.textContent = 'n/p for next/prev article, q to go back, ? for help';
      }
    }
  }

  /**
   * Update mode toggle button appearance
   */
  function updateModeButton() {
    const modeToggle = document.querySelector('.mode-toggle');
    if (modeToggle) {
      const indicator = modeToggle.querySelector('.mode-indicator');
      const label = modeToggle.querySelector('.mode-label');
      
      modeToggle.classList.toggle('evil-active', evilMode);
      modeToggle.setAttribute('aria-pressed', evilMode);
      
      if (indicator) {
        indicator.textContent = evilMode ? 'V' : 'E';
      }
      if (label) {
        label.textContent = evilMode ? 'Evil' : 'Emacs';
      }
    }
  }

  /**
   * Toggle Evil mode (Vim keybindings)
   */
  function toggleEvilMode() {
    evilMode = !evilMode;
    
    // Update button state and text
    updateModeButton();
    
    // Update help overlay visibility of keybinding sections
    const helpOverlay = document.getElementById('help-overlay');
    if (helpOverlay) {
      helpOverlay.classList.toggle('evil-mode', evilMode);
    }
    
    // Save preference
    localStorage.setItem('evil-mode', evilMode ? 'true' : 'false');
    
    // Show message
    showMessage(evilMode ? 'Evil mode enabled - Vim keybindings active' : 'Emacs mode enabled - Emacs keybindings active');
    
    // Update echo hint
    updateEchoHint();
  }

  /**
   * Initialize Evil mode from saved preference
   */
  function initEvilMode() {
    const saved = localStorage.getItem('evil-mode');
    if (saved === 'true') {
      evilMode = true;
    }
    
    // Update button to reflect current state
    updateModeButton();
    
    // Update help overlay
    const helpOverlay = document.getElementById('help-overlay');
    if (helpOverlay) {
      helpOverlay.classList.toggle('evil-mode', evilMode);
    }
  }

  /**
   * Get all article items
   */
  function getArticleItems() {
    return articleList ? Array.from(articleList.querySelectorAll('.article-item')) : [];
  }

  /**
   * Update selection in the article list
   * @param {number} newIndex - The new index to select
   * @param {boolean} scroll - Whether to scroll the item into view (default: true)
   */
  function updateSelection(newIndex, scroll = true) {
    const items = getArticleItems();
    if (items.length === 0) return;

    // Clamp index
    newIndex = Math.max(0, Math.min(newIndex, items.length - 1));
    
    // Skip if already selected
    if (newIndex === selectedIndex && items[selectedIndex]?.classList.contains('selected')) {
      return;
    }
    
    // Remove old selection
    items.forEach((item, i) => {
      item.classList.remove('selected');
      item.setAttribute('aria-selected', 'false');
      const marker = item.querySelector('.article-marker');
      if (marker) marker.textContent = ' ';
    });

    // Add new selection
    selectedIndex = newIndex;
    const selectedItem = items[selectedIndex];
    selectedItem.classList.add('selected');
    selectedItem.setAttribute('aria-selected', 'true');
    const marker = selectedItem.querySelector('.article-marker');
    if (marker) marker.textContent = '>';

    // Scroll into view (with flag to prevent scroll handler from fighting)
    if (scroll) {
      isScrollingProgrammatically = true;
      selectedItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      // Reset flag after scroll animation completes
      setTimeout(() => { isScrollingProgrammatically = false; }, 150);
    }

    // Update modeline
    updateListModeline();
    
    // If in split mode, auto-preview the article
    if (splitMode) {
      previewSelectedArticle();
    }
  }

  /**
   * Update list buffer modeline
   */
  function updateListModeline() {
    const items = getArticleItems();
    const modeline = bufferList?.querySelector('.modeline');
    if (modeline) {
      const scrollEl = modeline.querySelector('[data-scroll-position]');
      const lineEl = modeline.querySelector('[data-line-number]');
      
      if (scrollEl) {
        if (items.length === 0) {
          scrollEl.textContent = 'Empty';
        } else if (selectedIndex === 0) {
          scrollEl.textContent = 'Top';
        } else if (selectedIndex === items.length - 1) {
          scrollEl.textContent = 'Bot';
        } else {
          const pct = Math.round((selectedIndex / (items.length - 1)) * 100);
          scrollEl.textContent = pct + '%';
        }
      }
      
      if (lineEl) {
        lineEl.textContent = selectedIndex + 1;
      }
    }
  }

  /**
   * Set focus to a buffer
   */
  function focusBuffer(bufferName) {
    focusedBuffer = bufferName;
    
    if (bufferList) {
      bufferList.classList.toggle('focused', bufferName === 'list');
    }
    if (bufferContent) {
      bufferContent.classList.toggle('focused', bufferName === 'content');
    }
    
    updateEchoHint();
  }

  /**
   * Switch to a buffer (single buffer mode)
   */
  function switchBuffer(bufferName) {
    // If not in split mode, toggle buffer visibility
    if (!splitMode) {
      if (bufferList) {
        bufferList.classList.toggle('active', bufferName === 'list');
      }
      if (bufferContent) {
        bufferContent.classList.toggle('active', bufferName === 'content');
      }
    }
    
    focusBuffer(bufferName);
  }

  /**
   * Set split mode
   */
  function setSplitMode(mode) {
    splitMode = mode;
    
    if (!bufferContainer) return;
    
    // Remove existing split classes
    bufferContainer.classList.remove('split-horizontal', 'split-vertical');
    
    if (mode === 'horizontal') {
      // Side by side: list on left, content on right
      bufferContainer.classList.add('split-horizontal');
      bufferList?.classList.add('active');
      bufferContent?.classList.add('active');
      showMessage('Split horizontally (C-x 3)');
    } else if (mode === 'vertical') {
      // Stacked: list on top, content below
      bufferContainer.classList.add('split-vertical');
      bufferList?.classList.add('active');
      bufferContent?.classList.add('active');
      showMessage('Split vertically (C-x 2)');
    } else {
      // Single buffer mode
      // Keep current focused buffer active, hide the other
      if (focusedBuffer === 'list') {
        bufferList?.classList.add('active');
        bufferContent?.classList.remove('active');
      } else {
        bufferList?.classList.remove('active');
        bufferContent?.classList.add('active');
      }
    }
    
    // Ensure focused buffer styling
    focusBuffer(focusedBuffer);
    
    // If entering split mode with content visible, preview current article
    if (mode && bufferContent?.classList.contains('active')) {
      previewSelectedArticle();
    }
    
    updateEchoHint();
  }

  /**
   * Close current window (C-x 0)
   */
  function closeCurrentWindow() {
    if (!splitMode) {
      showMessage('Only one window');
      return;
    }
    
    // Close current window, switch to the other
    const otherBuffer = focusedBuffer === 'list' ? 'content' : 'list';
    focusBuffer(otherBuffer);
    setSplitMode(null);
    showMessage('Deleted window');
  }

  /**
   * Split window horizontally (C-x 3) - side by side
   */
  function splitHorizontal() {
    if (splitMode === 'horizontal') {
      showMessage('Already split horizontally');
      return;
    }
    setSplitMode('horizontal');
  }

  /**
   * Split window vertically (C-x 2) - stacked
   */
  function splitVertical() {
    if (splitMode === 'vertical') {
      showMessage('Already split vertically');
      return;
    }
    setSplitMode('vertical');
  }

  /**
   * Switch to other window (C-x o)
   */
  function otherWindow() {
    if (!splitMode) {
      // In single buffer mode, just toggle
      const other = focusedBuffer === 'list' ? 'content' : 'list';
      switchBuffer(other);
      showMessage('Switched to ' + (other === 'list' ? '*posts*' : 'article'));
    } else {
      // In split mode, switch focus
      const other = focusedBuffer === 'list' ? 'content' : 'list';
      focusBuffer(other);
      showMessage('Switched to ' + (other === 'list' ? '*posts*' : 'article'));
    }
  }

  /**
   * Preview selected article (without switching focus)
   */
  function previewSelectedArticle() {
    const items = getArticleItems();
    if (items.length === 0) return;

    const selectedItem = items[selectedIndex];
    const title = selectedItem.dataset.title;

    // Check if we have embedded content (homepage)
    if (postsData) {
      const template = postsData.querySelector(`template[data-post-index="${selectedIndex}"]`);
      if (template) {
        loadArticleContent(template, title, false);
        return;
      }
    }
  }

  /**
   * Open selected article (switch to content buffer or focus it)
   */
  function openSelectedArticle() {
    const items = getArticleItems();
    if (items.length === 0) return;

    const selectedItem = items[selectedIndex];
    const title = selectedItem.dataset.title;
    const url = selectedItem.dataset.url;

    // Check if we have embedded content (homepage)
    if (postsData) {
      const template = postsData.querySelector(`template[data-post-index="${selectedIndex}"]`);
      if (template) {
        // Update URL using History API for bookmarkability
        if (url && window.location.pathname !== url) {
          history.pushState({ 
            type: 'article', 
            index: selectedIndex, 
            url: url 
          }, title, url);
          document.title = title;
        }
        loadArticleContent(template, title, true);
        return;
      }
    }

    // Otherwise navigate to the URL (fallback)
    if (url) {
      window.location.href = url;
    }
  }

  /**
   * Load article content from template
   */
  function loadArticleContent(template, title, switchFocus = true) {
    if (!articleContent) return;

    // Clone and insert content
    const content = template.content.cloneNode(true);
    articleContent.innerHTML = '';
    articleContent.appendChild(content);

    // Fix relative image paths - convert to absolute from site root
    const imgTags = articleContent.querySelectorAll('img');
    imgTags.forEach(img => {
      const src = img.getAttribute('src');
      if (src && !src.startsWith('/') && !src.startsWith('http')) {
        img.setAttribute('src', '/' + src.replace(/^\.\//, ''));
      }
    });

    // Render KaTeX math if available
    if (typeof renderMathInElement !== 'undefined') {
      renderMathInElement(articleContent, {
        delimiters: [
          {left: '$$', right: '$$', display: true},
          {left: '$', right: '$', display: false},
          {left: '\\(', right: '\\)', display: false},
          {left: '\\[', right: '\\]', display: true}
        ]
      });
    }

    // Update content buffer modeline
    const modeline = bufferContent?.querySelector('.modeline');
    if (modeline) {
      const bufferName = modeline.querySelector('.modeline-buffer-name');
      if (bufferName) {
        bufferName.textContent = title.substring(0, 50);
        bufferName.title = title;
      }
    }

    // Switch to content buffer if requested and not in split mode
    if (switchFocus) {
      if (splitMode) {
        // In split mode, just focus the content buffer
        focusBuffer('content');
      } else {
        // In single buffer mode, switch to content
        switchBuffer('content');
      }
      showMessage('Opened: ' + title);
    }
    
    // Scroll content to top
    if (contentBody) {
      contentBody.scrollTop = 0;
    }
  }

  /**
   * Navigate to next/previous article while viewing content
   */
  function navigateArticle(direction) {
    const items = getArticleItems();
    
    // On single post page (no postsData), use prev/next links in the page
    if (!postsData && items.length === 0) {
      const nav = document.querySelector('.post-navigation');
      if (!nav) return;
      
      // Get all links in the navigation
      const links = Array.from(nav.querySelectorAll('a[href*="/posts/"]'));
      
      // For p (direction < 0): use first link (left, previous)
      // For n (direction > 0): use last link (right, next)
      let link = direction < 0 ? links[0] : links[links.length - 1];
      
      if (link) {
        // Get the href attribute
        const href = link.getAttribute('href');
        if (href) {
          // Hard-code the correct path based on href pattern
          // href like "../../posts/xyz/" -> "/posts/xyz/"
          if (href.includes('/posts/')) {
            const match = href.match(/(\/posts\/[^/]+)/);
            if (match) {
              window.location.href = match[1] + '/';
              return;
            }
          }
        }
      }
      
      // No link available in that direction
      showMessage(direction > 0 ? 'End of buffer' : 'Beginning of buffer');
      return;
    }
    
    if (items.length === 0) return;

    const newIndex = selectedIndex + direction;
    if (newIndex < 0 || newIndex >= items.length) {
      showMessage(direction > 0 ? 'End of buffer' : 'Beginning of buffer');
      return;
    }

    // Update selection
    updateSelection(newIndex);
    
    // Load the new article (in single buffer mode when viewing content)
    if (!splitMode) {
      const selectedItem = items[selectedIndex];
      const title = selectedItem.dataset.title;
      const url = selectedItem.dataset.url;
      
      if (postsData) {
        const template = postsData.querySelector(`template[data-post-index="${selectedIndex}"]`);
        if (template) {
          // Update URL using History API
          if (url && window.location.pathname !== url) {
            history.pushState({ 
              type: 'article', 
              index: selectedIndex, 
              url: url 
            }, title, url);
            document.title = title;
          }
          loadArticleContent(template, title, false);
        }
      }
    }
  }

  /**
   * Go back to list buffer
   */
  function goBack() {
    // On single.html pages, navigate to home
    if (!postsData) {
      window.location.href = '/';
      return;
    }

    // If in split mode, just focus list
    if (splitMode) {
      focusBuffer('list');
      showMessage('Switched to *posts*');
      return;
    }

    // In single buffer mode, switch to list buffer
    // Update URL back to list page
    if (window.location.pathname !== baseUrl) {
      history.pushState({ type: 'list' }, baseTitle, baseUrl);
      document.title = baseTitle;
    }
    switchBuffer('list');
    showMessage('Switched to buffer: *posts*');
  }

  /**
   * Scroll content
   */
  function scrollContent(direction) {
    if (!contentBody) return;
    
    const scrollAmount = contentBody.clientHeight * 0.8;
    contentBody.scrollBy({
      top: direction === 'down' ? scrollAmount : -scrollAmount,
      behavior: 'smooth'
    });
  }

  /**
   * Toggle help overlay
   */
  function toggleHelp() {
    if (!helpOverlay) return;
    
    const isVisible = helpOverlay.classList.contains('visible');
    helpOverlay.classList.toggle('visible', !isVisible);
    helpOverlay.setAttribute('aria-hidden', isVisible);
    
    if (!isVisible) {
      document.getElementById('help-close')?.focus();
    }
  }

  /**
   * Handle key sequence (C-x prefix)
   */
  function handleKeySequence(key) {
    if (keySequence === 'C-x') {
      switch (key) {
        case 'o':
          // C-x o - other window
          otherWindow();
          keySequence = '';
          return true;
        case '0':
          // C-x 0 - close current window
          closeCurrentWindow();
          keySequence = '';
          return true;
        case '2':
          // C-x 2 - split vertically (stacked)
          splitVertical();
          keySequence = '';
          return true;
        case '3':
          // C-x 3 - split horizontally (side by side)
          splitHorizontal();
          keySequence = '';
          return true;
        case 'b':
          // C-x b - switch to list buffer
          switchBuffer('list');
          keySequence = '';
          showMessage('Switched to *posts*');
          return true;
        case '1':
          // C-x 1 - delete other windows (go to single buffer)
          if (splitMode) {
            setSplitMode(null);
            showMessage('Deleted other windows');
          } else {
            showMessage('Only one window');
          }
          keySequence = '';
          return true;
        default:
          keySequence = '';
          showMessage('C-x ' + key + ' is undefined');
          return false;
      }
    }
    
    // g prefix sequences (works in both modes)
    keySequence += key;
    
    if (sequenceTimeout) {
      clearTimeout(sequenceTimeout);
    }

    const sequences = {
      'gh': () => { window.location.href = '/'; },
      'gp': () => { window.location.href = '/post/'; },
      'gg': () => { 
        if (focusedBuffer === 'list') {
          updateSelection(0);
        } else if (contentBody) {
          contentBody.scrollTop = 0;
        }
      }
    };

    if (sequences[keySequence]) {
      sequences[keySequence]();
      keySequence = '';
      return true;
    }

    sequenceTimeout = setTimeout(() => {
      keySequence = '';
    }, 1000);

    showMessage(keySequence + '-');
    return false;
  }

  /**
   * Handle Evil mode window management sequences (Ctrl-w prefix)
   */
  function handleEvilWindowSequence(key) {
    if (keySequence === 'C-w') {
      switch (key) {
        case 'w':
        case 'W':
          // Ctrl-w w - switch to other window
          otherWindow();
          keySequence = '';
          return true;
        case 'c':
        case 'C':
          // Ctrl-w c - close current window
          closeCurrentWindow();
          keySequence = '';
          return true;
        case 'v':
        case 'V':
          // Ctrl-w v - split vertically (side by side in Vim terms)
          splitHorizontal();
          keySequence = '';
          return true;
        case 's':
        case 'S':
          // Ctrl-w s - split horizontally (stacked in Vim terms)
          splitVertical();
          keySequence = '';
          return true;
        case 'o':
        case 'O':
          // Ctrl-w o - close other windows (only one)
          if (splitMode) {
            setSplitMode(null);
            showMessage('Deleted other windows');
          } else {
            showMessage('Only one window');
          }
          keySequence = '';
          return true;
        case 'h':
        case 'H':
        case 'ArrowLeft':
          // Ctrl-w h - focus left window (list)
          focusBuffer('list');
          showMessage('Switched to *posts*');
          keySequence = '';
          return true;
        case 'l':
        case 'L':
        case 'ArrowRight':
          // Ctrl-w l - focus right window (content)
          focusBuffer('content');
          showMessage('Switched to article');
          keySequence = '';
          return true;
        case 'j':
        case 'J':
        case 'ArrowDown':
        case 'k':
        case 'K':
        case 'ArrowUp':
          // Ctrl-w j/k - in vertical split, switch windows
          otherWindow();
          keySequence = '';
          return true;
        default:
          keySequence = '';
          showMessage('Ctrl-w ' + key + ' is undefined');
          return false;
      }
    }
    return false;
  }

  /**
   * Main keyboard handler
   */
  function handleKeydown(e) {
    // Ignore if typing in input
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
      return;
    }

    // Close help on Escape
    if (e.key === 'Escape') {
      if (helpOverlay?.classList.contains('visible')) {
        toggleHelp();
        e.preventDefault();
        return;
      }
    }

    // Help
    if (e.key === '?') {
      toggleHelp();
      e.preventDefault();
      return;
    }

    // If help is open, ignore other keys
    if (helpOverlay?.classList.contains('visible')) {
      return;
    }

    const key = e.key;
    const ctrl = e.ctrlKey;
    const meta = e.metaKey;
    const shift = e.shiftKey;

    // Handle C-x prefix sequences (Emacs)
    if (keySequence === 'C-x') {
      if (handleKeySequence(key)) {
        e.preventDefault();
        return;
      }
    }

    // Handle Ctrl-w prefix sequences (Evil mode window management)
    if (evilMode && keySequence === 'C-w') {
      if (handleEvilWindowSequence(key)) {
        e.preventDefault();
        return;
      }
    }

    // Key sequences (g prefix) - works in both modes
    if (keySequence || key === 'g') {
      if (handleKeySequence(key.toLowerCase())) {
        e.preventDefault();
        return;
      }
      if (keySequence) return;
    }

    // C-x prefix (Emacs)
    if (ctrl && key === 'x') {
      keySequence = 'C-x';
      showMessage('C-x-');
      e.preventDefault();
      return;
    }

    // Ctrl-w prefix (Evil mode window management)
    if (evilMode && ctrl && key === 'w') {
      keySequence = 'C-w';
      showMessage('Ctrl-w-');
      e.preventDefault();
      return;
    }

    // C-g - keyboard quit
    if (ctrl && key === 'g') {
      if (helpOverlay?.classList.contains('visible')) {
        toggleHelp();
      }
      keySequence = '';
      showMessage('Quit');
      e.preventDefault();
      return;
    }

    // === LIST BUFFER ===
    if (focusedBuffer === 'list') {
      // Evil mode (Vim) keybindings
      if (evilMode) {
        switch (key) {
          case 'j':
          case 'ArrowDown':
            updateSelection(selectedIndex + 1);
            e.preventDefault();
            return;
          case 'k':
          case 'ArrowUp':
            updateSelection(selectedIndex - 1);
            e.preventDefault();
            return;
          case 'Enter':
          case 'l':
            openSelectedArticle();
            e.preventDefault();
            return;
          case 'h':
            // h goes back in evil mode
            goBack();
            e.preventDefault();
            return;
          case ' ':
            // Space in list - open article
            if (!splitMode) {
              openSelectedArticle();
            } else {
              scrollContent('down');
            }
            e.preventDefault();
            return;
          case 'G':
            // G - go to end (Vim style)
            if (shift) {
              updateSelection(getArticleItems().length - 1);
              e.preventDefault();
            }
            return;
          case 'H':
            // H - high (top of screen) - go to beginning
            updateSelection(0);
            e.preventDefault();
            return;
          case 'L':
            // L - low (bottom) - go to end
            updateSelection(getArticleItems().length - 1);
            e.preventDefault();
            return;
        }
      }
      
      // Emacs keybindings (default)
      switch (key) {
        case 'n':
        case 'ArrowDown':
          if (!evilMode) {
            updateSelection(selectedIndex + 1);
            e.preventDefault();
          }
          break;
        case 'p':
        case 'ArrowUp':
          if (!evilMode) {
            updateSelection(selectedIndex - 1);
            e.preventDefault();
          }
          break;
        case 'Enter':
        case 'o':
          if (!evilMode || key === 'Enter') {
            openSelectedArticle();
            e.preventDefault();
          }
          break;
        case ' ':
          // Space in list - open article
          if (!splitMode) {
            openSelectedArticle();
          } else {
            // In split mode, space scrolls the content pane
            scrollContent('down');
          }
          e.preventDefault();
          break;
        case '<':
          if (!evilMode) {
            updateSelection(0);
            e.preventDefault();
          }
          break;
        case '>':
          if (!evilMode) {
            updateSelection(getArticleItems().length - 1);
            e.preventDefault();
          }
          break;
      }
    }

    // === CONTENT BUFFER ===
    if (focusedBuffer === 'content') {
      // Evil mode (Vim) keybindings for content
      if (evilMode) {
        switch (key) {
          case 'j':
          case 'ArrowDown':
            // j - scroll down
            contentBody?.scrollBy({ top: 150, behavior: 'smooth' });
            e.preventDefault();
            return;
          case 'k':
          case 'ArrowUp':
            // k - scroll up
            contentBody?.scrollBy({ top: -150, behavior: 'smooth' });
            e.preventDefault();
            return;
          case 'n':
            // n - next article (Vim: next search result, we use for next article)
            if (!ctrl) {
              navigateArticle(1);
              e.preventDefault();
            }
            return;
          case 'N':
            // N - previous article (Vim: previous search result)
            navigateArticle(-1);
            e.preventDefault();
            return;
          case 'h':
            // h - go back to list
            goBack();
            e.preventDefault();
            return;
          case 'l':
            // l - in content, do nothing (or could scroll right if we had horizontal scroll)
            return;
          case 'G':
            // G - go to end of buffer
            if (contentBody) contentBody.scrollTop = contentBody.scrollHeight;
            e.preventDefault();
            return;
          case 'd':
            // Ctrl-d - half page down
            if (ctrl) {
              const halfPage = contentBody ? contentBody.clientHeight / 2 : 300;
              contentBody?.scrollBy({ top: halfPage, behavior: 'smooth' });
              e.preventDefault();
            }
            return;
          case 'u':
            // Ctrl-u - half page up
            if (ctrl) {
              const halfPage = contentBody ? contentBody.clientHeight / 2 : 300;
              contentBody?.scrollBy({ top: -halfPage, behavior: 'smooth' });
              e.preventDefault();
            }
            return;
          case 'f':
            // Ctrl-f - full page down
            if (ctrl) {
              scrollContent('down');
              e.preventDefault();
            }
            return;
          case 'b':
            // Ctrl-b - full page up
            if (ctrl) {
              scrollContent('up');
              e.preventDefault();
            }
            return;
          case ' ':
            // Space - page down
            scrollContent(shift ? 'up' : 'down');
            e.preventDefault();
            return;
          case 'q':
            // q - go back to list
            goBack();
            e.preventDefault();
            return;
        }
      }
      
      // Emacs keybindings (default)
      switch (key) {
        case 'n':
          // n - scroll down or next article (single buffer mode without split)
          if (!ctrl && !evilMode) {
            if (splitMode) {
              // In split mode, n scrolls content
              contentBody?.scrollBy({ top: 150, behavior: 'smooth' });
            } else {
              // In single buffer mode, n goes to next article
              navigateArticle(1);
            }
            e.preventDefault();
          }
          break;
        case 'p':
          // p - scroll up or previous article (single buffer mode without split)
          if (!ctrl && !evilMode) {
            if (splitMode) {
              // In split mode, p scrolls content
              contentBody?.scrollBy({ top: -150, behavior: 'smooth' });
            } else {
              // In single buffer mode, p goes to previous article
              navigateArticle(-1);
            }
            e.preventDefault();
          }
          break;
        case 'ArrowDown':
          // Arrow down - scroll
          if (!evilMode) {
            contentBody?.scrollBy({ top: 150, behavior: 'smooth' });
            e.preventDefault();
          }
          break;
        case 'ArrowUp':
          // Arrow up - scroll
          if (!evilMode) {
            contentBody?.scrollBy({ top: -150, behavior: 'smooth' });
            e.preventDefault();
          }
          break;
        case 'PageDown':
          // Page Down - scroll page
          scrollContent('down');
          e.preventDefault();
          break;
        case 'PageUp':
          // Page Up - scroll page
          scrollContent('up');
          e.preventDefault();
          break;
        case ' ':
          // Space - page down, Shift+Space - page up
          if (!evilMode) {
            scrollContent(shift ? 'up' : 'down');
            e.preventDefault();
          }
          break;
        case 'v':
          // C-v page down, M-v page up
          if (!evilMode) {
            if (ctrl) {
              scrollContent('down');
              e.preventDefault();
            } else if (meta || e.altKey) {
              scrollContent('up');
              e.preventDefault();
            }
          }
          break;
        case '<':
          // Beginning of buffer
          if (!evilMode) {
            if (contentBody) contentBody.scrollTop = 0;
            e.preventDefault();
          }
          break;
        case '>':
          // End of buffer
          if (!evilMode) {
            if (contentBody) contentBody.scrollTop = contentBody.scrollHeight;
            e.preventDefault();
          }
          break;
        case 'q':
          // q - go back to list
          if (!evilMode) {
            goBack();
            e.preventDefault();
          }
          break;
      }
    }

    // === GLOBAL ===
    switch (key) {
      case 'Tab':
        // Tab switches focus in split mode
        if (splitMode) {
          otherWindow();
          e.preventDefault();
        }
        break;
      case 't':
        if (!ctrl && !meta) {
          window.toggleTheme?.();
          e.preventDefault();
        }
        break;
      case '+':
      case '=':
        window.adjustFontSize?.(1);
        e.preventDefault();
        break;
      case '-':
        if (!ctrl && !meta) {
          window.adjustFontSize?.(-1);
          e.preventDefault();
        }
        break;
      case '0':
        if (!ctrl && !meta) {
          window.resetFontSize?.();
          e.preventDefault();
        }
        break;
    }
  }

  /**
   * Handle click on article item - single click opens
   */
  function handleArticleClick(e) {
    const item = e.target.closest('.article-item');
    if (!item) return;

    // Prevent default link navigation - JS will handle it
    e.preventDefault();

    const index = parseInt(item.dataset.index, 10);
    if (!isNaN(index)) {
      focusBuffer('list');
      updateSelection(index);
      openSelectedArticle();
    }
  }

  /**
   * Handle browser back/forward navigation
   */
  function handlePopState(e) {
    // Only handle if we have embedded posts data
    if (!postsData) return;

    const state = e.state;
    
    if (state && state.type === 'article' && state.index !== undefined) {
      // Navigate to specific article
      const items = getArticleItems();
      if (items[state.index]) {
        updateSelection(state.index);
        const template = postsData.querySelector(`template[data-post-index="${state.index}"]`);
        if (template) {
          const title = items[state.index].dataset.title;
          document.title = title;
          loadArticleContent(template, title, true);
        }
      }
    } else {
      // Go back to list view
      document.title = baseTitle;
      switchBuffer('list');
    }
  }

  /**
   * Handle click on content buffer
   */
  function handleContentClick() {
    focusBuffer('content');
  }

  /**
   * Handle scroll on article list - update selection based on visible item
   */
  function handleListScroll(e) {
    // Skip if this scroll was triggered by keyboard navigation
    if (isScrollingProgrammatically) return;
    
    const scrollContainer = e.target;
    const items = getArticleItems();
    if (items.length === 0) return;
    
    const containerRect = scrollContainer.getBoundingClientRect();
    const containerTop = containerRect.top;
    
    // Find the item closest to the top of the visible area
    let closestIndex = 0;
    let closestDistance = Infinity;
    
    items.forEach((item, index) => {
      const itemRect = item.getBoundingClientRect();
      const itemTop = itemRect.top - containerTop;
      
      // We want the item that's closest to the top of the container
      // but still visible (itemTop >= 0 or item is partially visible)
      if (itemTop >= -itemRect.height / 2) {
        const distance = Math.abs(itemTop);
        if (distance < closestDistance) {
          closestDistance = distance;
          closestIndex = index;
        }
      }
    });
    
    // Update selection without scrolling (to avoid fighting with user scroll)
    if (closestIndex !== selectedIndex) {
      updateSelection(closestIndex, false);
    }
  }

  /**
   * Initialize
   */
  function init() {
    // Initialize DOM element references
    bufferContainer = document.getElementById('buffer-container');
    articleList = document.getElementById('article-list');
    bufferList = document.getElementById('buffer-list');
    bufferContent = document.getElementById('buffer-content');
    contentBody = document.getElementById('content-body');
    articleContent = document.getElementById('article-content');
    postsData = document.getElementById('posts-data');
    echoMessage = document.getElementById('echo-message');
    helpOverlay = document.getElementById('help-overlay');

    // Keyboard events
    document.addEventListener('keydown', handleKeydown);

    // Click events
    articleList?.addEventListener('click', handleArticleClick);
    bufferContent?.addEventListener('click', handleContentClick);

    // Scroll events for list buffer - update selection as user scrolls
    const listBufferBody = bufferList?.querySelector('.buffer-body');
    if (listBufferBody) {
      listBufferBody.addEventListener('scroll', handleListScroll, { passive: true });
    }

    // Browser back/forward navigation
    window.addEventListener('popstate', handlePopState);

    // Help close button
    document.getElementById('help-close')?.addEventListener('click', toggleHelp);
    
    // Initialize Evil mode from saved preference
    initEvilMode();

    // Initialize selection and modeline
    updateListModeline();
    
    // Set initial focus based on which buffer is active in the DOM
    // Check content buffer first (single post page), then list (list page)
    if (bufferContent?.classList.contains('active')) {
      focusBuffer('content');
    } else if (bufferList?.classList.contains('active')) {
      focusBuffer('list');
    } else {
      // Fallback: postsData exists = list page, otherwise single post page
      focusBuffer(postsData ? 'list' : 'content');
    }

    // Set initial echo area message
    updateEchoHint();
    
    // Set initial history state for the list page
    if (postsData && !history.state) {
      history.replaceState({ type: 'list' }, baseTitle, baseUrl);
    }
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Expose for other modules
  window.emacsBlog = window.emacsBlog || {};
  window.emacsBlog.keyboard = {
    switchBuffer,
    focusBuffer,
    setSplitMode,
    updateSelection,
    showMessage,
    toggleEvilMode,
    isEvilMode: () => evilMode
  };
  
  // Also expose toggleEvilMode globally for menu.js
  window.toggleEvilMode = toggleEvilMode;
})();

import './index.css';
import { GoogleGenAI } from '@google/genai';

// --- Types ---
type AiActionType = 'GenerateTitle' | 'GenerateMeta' | 'SuggestLSI' | 'RewriteParagraph';

interface RateLimitState {
  attemptsToday: number;
  lastAttemptTimestamp: number;
  dateResetString: string;
}

// --- DOM Elements ---
const el = {
  themeToggle: document.getElementById('sw-theme-toggle') as HTMLButtonElement,
  sunIcon: document.querySelector('.sw-sun-icon') as SVGElement,
  moonIcon: document.querySelector('.sw-moon-icon') as SVGElement,
  exportBtn: document.getElementById('sw-export-btn') as HTMLButtonElement,
  
  focusKeyword: document.getElementById('sw-focus-keyword') as HTMLInputElement,
  content: document.getElementById('sw-content') as HTMLTextAreaElement,
  
  wordCount: document.getElementById('sw-word-count') as HTMLSpanElement,
  readingTime: document.getElementById('sw-reading-time') as HTMLSpanElement,
  keywordDensity: document.getElementById('sw-keyword-density') as HTMLSpanElement,
  
  scorePath: document.getElementById('sw-score-path') as SVGPathElement,
  scoreText: document.getElementById('sw-score-text') as SVGTextElement,
  
  checkLength: document.getElementById('sw-check-length') as HTMLLIElement,
  checkDensity: document.getElementById('sw-check-density') as HTMLLIElement,
  checkFirst100: document.getElementById('sw-check-first100') as HTMLLIElement,
  checkParagraphs: document.getElementById('sw-check-paragraphs') as HTMLLIElement,
  
  userApiKey: document.getElementById('sw-user-api-key') as HTMLInputElement,
  
  aiButtons: document.querySelectorAll('.sw-btn-ai') as NodeListOf<HTMLButtonElement>,
  aiFeedback: document.getElementById('sw-ai-feedback') as HTMLDivElement,
  aiResultBox: document.getElementById('sw-ai-result') as HTMLDivElement,
  aiResultContent: document.getElementById('sw-ai-result-content') as HTMLDivElement,
  aiCopyBtn: document.getElementById('sw-ai-copy-btn') as HTMLButtonElement,
};

// --- State ---
let currentScore = 0;

// --- Theme Management ---
function initTheme() {
  const savedTheme = localStorage.getItem('sw-theme') || 'light';
  document.documentElement.setAttribute('data-sw-theme', savedTheme);
  updateThemeIcons(savedTheme);

  el.themeToggle.addEventListener('click', () => {
    const currentTheme = document.documentElement.getAttribute('data-sw-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-sw-theme', newTheme);
    localStorage.setItem('sw-theme', newTheme);
    updateThemeIcons(newTheme);
  });
}

function updateThemeIcons(theme: string) {
  if (theme === 'dark') {
    el.sunIcon.style.display = 'none';
    el.moonIcon.style.display = 'block';
  } else {
    el.sunIcon.style.display = 'block';
    el.moonIcon.style.display = 'none';
  }
}

// --- SEO Engine ---
function debounce(func: Function, wait: number) {
  let timeout: ReturnType<typeof setTimeout>;
  return function executedFunction(...args: any[]) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

function updateScoreUI(score: number) {
  currentScore = score;
  el.scoreText.textContent = score.toString();
  el.scorePath.setAttribute('stroke-dasharray', `${score}, 100`);
  
  let color = 'var(--sw-error)';
  if (score >= 80) color = 'var(--sw-success)';
  else if (score >= 50) color = 'var(--sw-warning)';
  
  el.scorePath.style.stroke = color;
  el.scoreText.style.fill = color;
}

function setCheckStatus(element: HTMLLIElement, status: 'pass' | 'fail' | 'warn' | 'pending') {
  element.className = `sw-list-item sw-${status}`;
}

function analyzeSEO() {
  const text = el.content.value.trim();
  const keyword = el.focusKeyword.value.trim().toLowerCase();
  
  if (!text) {
    el.wordCount.textContent = '0';
    el.readingTime.textContent = '0m';
    el.keywordDensity.textContent = '0%';
    updateScoreUI(0);
    setCheckStatus(el.checkLength, 'pending');
    setCheckStatus(el.checkDensity, 'pending');
    setCheckStatus(el.checkFirst100, 'pending');
    setCheckStatus(el.checkParagraphs, 'pending');
    return;
  }

  // Word Count & Reading Time
  const words = text.split(/\s+/).filter(w => w.length > 0);
  const wordCount = words.length;
  el.wordCount.textContent = wordCount.toString();
  el.readingTime.textContent = Math.ceil(wordCount / 200) + 'm';

  let score = 0;

  // 1. Length Check (> 300 words)
  if (wordCount > 300) {
    setCheckStatus(el.checkLength, 'pass');
    score += 25;
  } else {
    setCheckStatus(el.checkLength, 'fail');
    score += Math.floor((wordCount / 300) * 25);
  }

  // 2. Paragraph Length Check (< 300 words per paragraph)
  const paragraphs = text.split(/\n+/).filter(p => p.trim().length > 0);
  const hasLongParagraph = paragraphs.some(p => p.split(/\s+/).length > 300);
  if (hasLongParagraph) {
    setCheckStatus(el.checkParagraphs, 'warn');
    score += 10;
  } else {
    setCheckStatus(el.checkParagraphs, 'pass');
    score += 25;
  }

  // Keyword Analysis
  if (keyword) {
    const keywordRegex = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    const matches = text.match(keywordRegex);
    const keywordCount = matches ? matches.length : 0;
    
    // 3. Density (Target 1-2%)
    const density = wordCount > 0 ? (keywordCount / wordCount) * 100 : 0;
    el.keywordDensity.textContent = density.toFixed(1) + '%';
    
    if (density >= 1 && density <= 2.5) {
      setCheckStatus(el.checkDensity, 'pass');
      score += 25;
    } else if (density > 0) {
      setCheckStatus(el.checkDensity, 'warn');
      score += 10;
    } else {
      setCheckStatus(el.checkDensity, 'fail');
    }

    // 4. Keyword in first 100 words
    const first100Words = words.slice(0, 100).join(' ').toLowerCase();
    if (first100Words.includes(keyword)) {
      setCheckStatus(el.checkFirst100, 'pass');
      score += 25;
    } else {
      setCheckStatus(el.checkFirst100, 'fail');
    }
  } else {
    el.keywordDensity.textContent = '0%';
    setCheckStatus(el.checkDensity, 'pending');
    setCheckStatus(el.checkFirst100, 'pending');
    // If no keyword, max score is 50
  }

  updateScoreUI(score);
}

// --- Rate Limiting ---
function getRateLimitState(): RateLimitState {
  const today = new Date().toISOString().split('T')[0];
  const defaultState: RateLimitState = { attemptsToday: 0, lastAttemptTimestamp: 0, dateResetString: today };
  
  try {
    const saved = localStorage.getItem('sw-rate-limit');
    if (saved) {
      const state = JSON.parse(saved) as RateLimitState;
      if (state.dateResetString !== today) {
        return defaultState;
      }
      return state;
    }
  } catch (e) {
    // Ignore parse errors
  }
  return defaultState;
}

function saveRateLimitState(state: RateLimitState) {
  localStorage.setItem('sw-rate-limit', JSON.stringify(state));
}

function checkRateLimit(): { allowed: boolean; message?: string } {
  const state = getRateLimitState();
  const now = Date.now();
  
  if (state.attemptsToday >= 3) {
    return { allowed: false, message: 'Daily limit reached (3/3). Try again tomorrow.' };
  }
  
  const timeSinceLast = now - state.lastAttemptTimestamp;
  const cooldownMs = 60 * 1000; // 1 minute
  
  if (timeSinceLast < cooldownMs) {
    const secondsLeft = Math.ceil((cooldownMs - timeSinceLast) / 1000);
    return { allowed: false, message: `Please wait ${secondsLeft} seconds before trying again.` };
  }
  
  return { allowed: true };
}

function recordAiAttempt() {
  const state = getRateLimitState();
  state.attemptsToday += 1;
  state.lastAttemptTimestamp = Date.now();
  saveRateLimitState(state);
}

// --- AI Assistant ---
let countdownInterval: ReturnType<typeof setInterval> | null = null;

function showFeedback(message: string, isError = false) {
  if (countdownInterval) clearInterval(countdownInterval);
  el.aiFeedback.textContent = message;
  el.aiFeedback.style.display = 'block';
  if (isError) {
    el.aiFeedback.classList.add('sw-error');
  } else {
    el.aiFeedback.classList.remove('sw-error');
  }
}

function startCountdown(secondsLeft: number) {
  if (countdownInterval) clearInterval(countdownInterval);
  
  el.aiFeedback.style.display = 'block';
  el.aiFeedback.classList.add('sw-error');
  
  const updateText = (sec: number) => {
    el.aiFeedback.textContent = `Please wait ${sec} seconds before trying again.`;
  };
  
  updateText(secondsLeft);
  
  countdownInterval = setInterval(() => {
    secondsLeft -= 1;
    if (secondsLeft <= 0) {
      if (countdownInterval) clearInterval(countdownInterval);
      hideFeedback();
    } else {
      updateText(secondsLeft);
    }
  }, 1000);
}

function hideFeedback() {
  if (countdownInterval) clearInterval(countdownInterval);
  el.aiFeedback.style.display = 'none';
}

function showAiResult(content: string) {
  el.aiResultContent.textContent = content;
  el.aiResultBox.style.display = 'block';
}

async function handleAiAction(action: AiActionType) {
  const text = el.content.value.trim();
  const keyword = el.focusKeyword.value.trim();
  const customKey = el.userApiKey.value.trim();
  const useCustomKey = customKey.length > 0;
  
  if (!text && action !== 'GenerateTitle' && action !== 'SuggestLSI') {
    showFeedback('Please enter some article content first.', true);
    return;
  }

  if (!useCustomKey) {
    const rateLimitCheck = checkRateLimit();
    if (!rateLimitCheck.allowed) {
      if (rateLimitCheck.message?.includes('seconds')) {
        const match = rateLimitCheck.message.match(/\d+/);
        if (match) {
          startCountdown(parseInt(match[0], 10));
          return;
        }
      }
      showFeedback(rateLimitCheck.message || 'Rate limited.', true);
      return;
    }
  }

  const apiKey = useCustomKey ? customKey : process.env.GEMINI_API_KEY;
  if (!apiKey) {
    showFeedback('API Key is missing. Please configure GEMINI_API_KEY or enter your own.', true);
    return;
  }

  // Disable buttons
  el.aiButtons.forEach(btn => btn.disabled = true);
  showFeedback('Generating...', false);
  el.aiResultBox.style.display = 'none';

  try {
    const ai = new GoogleGenAI({ apiKey });
    let prompt = '';

    switch (action) {
      case 'GenerateTitle':
        prompt = `Generate 3 catchy, SEO-optimized blog post titles. ${keyword ? `Focus keyword: "${keyword}".` : ''} ${text ? `Context: ${text.substring(0, 500)}` : ''}\nReturn ONLY the titles, one per line, no markdown.`;
        break;
      case 'GenerateMeta':
        prompt = `Generate a compelling SEO meta description (under 160 characters) for the following article. ${keyword ? `Include the focus keyword: "${keyword}".` : ''}\nArticle snippet: ${text.substring(0, 800)}\nReturn ONLY the meta description text, no markdown.`;
        break;
      case 'SuggestLSI':
        prompt = `Suggest 10 LSI (Latent Semantic Indexing) keywords related to "${keyword || text.substring(0, 50)}". Return ONLY a comma-separated list, no markdown.`;
        break;
      case 'RewriteParagraph':
        // For simplicity, we just rewrite the first paragraph or a selected portion.
        // In a real app, we might use window.getSelection().
        const snippet = text.substring(0, 400);
        prompt = `Rewrite the following paragraph to be more engaging and SEO-friendly. ${keyword ? `Naturally include the keyword: "${keyword}".` : ''}\nParagraph: ${snippet}\nReturn ONLY the rewritten text, no markdown.`;
        break;
    }

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    const resultText = response.text || 'No response generated.';
    
    if (!useCustomKey) {
      recordAiAttempt();
    }
    
    hideFeedback();
    showAiResult(resultText.trim());

  } catch (error) {
    console.error('AI Error:', error);
    showFeedback('Failed to generate content. Please try again.', true);
  } finally {
    el.aiButtons.forEach(btn => btn.disabled = false);
  }
}

// --- Export ---
function exportReport() {
  const text = el.content.value.trim();
  const keyword = el.focusKeyword.value.trim();
  
  const report = `
SEO Optimizer Report
--------------------
Date: ${new Date().toLocaleString()}
Focus Keyword: ${keyword || 'None'}
Overall Score: ${currentScore}/100

Metrics:
- Word Count: ${el.wordCount.textContent}
- Reading Time: ${el.readingTime.textContent}
- Keyword Density: ${el.keywordDensity.textContent}

Analysis:
- Content Length (>300 words): ${el.checkLength.classList.contains('sw-pass') ? 'Pass' : 'Fail'}
- Keyword Density (1-2%): ${el.checkDensity.classList.contains('sw-pass') ? 'Pass' : el.checkDensity.classList.contains('sw-warn') ? 'Warning' : 'Fail'}
- Keyword in First 100 Words: ${el.checkFirst100.classList.contains('sw-pass') ? 'Pass' : 'Fail'}
- Paragraphs Length (<300 words): ${el.checkParagraphs.classList.contains('sw-pass') ? 'Pass' : 'Warning'}
  `;

  const blob = new Blob([report.trim()], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'seo-report.txt';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// --- Initialization ---
function init() {
  initTheme();
  
  const savedApiKey = localStorage.getItem('sw-user-api-key');
  if (savedApiKey) {
    el.userApiKey.value = savedApiKey;
  }
  
  el.userApiKey.addEventListener('change', (e) => {
    localStorage.setItem('sw-user-api-key', (e.target as HTMLInputElement).value.trim());
  });
  
  const debouncedAnalyze = debounce(analyzeSEO, 500);
  
  el.content.addEventListener('input', debouncedAnalyze);
  el.focusKeyword.addEventListener('input', debouncedAnalyze);
  
  el.exportBtn.addEventListener('click', exportReport);
  
  el.aiButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const action = (e.target as HTMLButtonElement).getAttribute('data-action') as AiActionType;
      if (action) handleAiAction(action);
    });
  });

  el.aiCopyBtn.addEventListener('click', () => {
    const text = el.aiResultContent.textContent;
    if (text) {
      navigator.clipboard.writeText(text).then(() => {
        const originalTitle = el.aiCopyBtn.title;
        el.aiCopyBtn.title = 'Copied!';
        setTimeout(() => el.aiCopyBtn.title = originalTitle, 2000);
      });
    }
  });

  // Initial analysis
  analyzeSEO();
}

// Run init when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}


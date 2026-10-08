// Search is intentionally independent of optional local-model generation.
// This script is injected after app.html, so it is the sole handler for both forms.
(() => {
  const keywordForm = document.getElementById('kBar');
  const answerForm = document.getElementById('aBar');
  const keywordInput = document.getElementById('q');
  const questionInput = document.getElementById('question');
  const searchStatus = document.getElementById('searchStatus');
  const answerStatus = document.getElementById('answerStatus');
  const searchCancel = document.getElementById('searchCancel');
  const answerCancel = document.getElementById('answerCancel');
  const locateButton = answerForm.querySelector('button[type="submit"]');
  const keywordButton = keywordForm.querySelector('button[type="submit"]');
  const explainButton = document.getElementById('generateExplanation');
  // These are course-workspace controllers.  Translation owns a separate
  // controller in app.html, so a tab change never aborts either workflow.
  let searchRequest = null;
  let answerRequest = null;
  let requestVersion = 0;

  const setBusy = (button, cancel, busy) => {
    button.disabled = busy;
    cancel.hidden = !busy;
  };
  const isAbort = (error, controller) => controller.signal.aborted || error?.name === 'AbortError';

  async function locate(query, source) {
    searchRequest?.abort('superseded');
    const controller = new AbortController();
    const version = ++requestVersion;
    searchRequest = controller;
    const button = source === 'question' ? locateButton : keywordButton;
    const cancel = source === 'question' ? answerCancel : searchCancel;
    const status = source === 'question' ? answerStatus : searchStatus;
    setBusy(button, cancel, true);
    status.textContent = '正在定位笔记版课件…';
    document.getElementById('results').innerHTML = '<div class="empty">正在检索本地笔记版课件…</div>';
    try {
      const response = await fetch('/api/search?q=' + encodeURIComponent(query), {signal: controller.signal});
      const data = await response.json();
      if (!response.ok) throw Error(data.error || '课件检索失败');
      if (version !== requestVersion) return null;
      list(data.results || []); // list() immediately selects and previews the top PDF hit.
      status.textContent = (data.results || []).length + ' 个匹配页面已定位';
      return data.results || [];
    } catch (error) {
      if (version !== requestVersion) return null;
      if (isAbort(error, controller)) {
        status.textContent = '已取消定位';
      } else {
        document.getElementById('results').innerHTML = '<div class="empty">' + esc(error.message || '课件检索失败') + '</div>';
        status.textContent = '定位失败';
      }
      return null;
    } finally {
      if (searchRequest === controller) {
        searchRequest = null;
        setBusy(button, cancel, false);
      }
    }
  }

  keywordForm.onsubmit = event => {
    event.preventDefault();
    const query = keywordInput.value.trim();
    if (query) locate(query, 'keyword');
  };
  answerForm.onsubmit = event => {
    event.preventDefault();
    const question = questionInput.value.trim();
    if (question) locate(question, 'question');
  };
  searchCancel.onclick = () => searchRequest?.abort('cancelled');
  answerCancel.onclick = () => answerRequest?.abort('cancelled');

  explainButton.onclick = async () => {
    const question = questionInput.value.trim();
    if (!question || answerRequest) return;
    // Always complete the fast, deterministic location step before model work.
    const located = await locate(question, 'question');
    if (located === null) return;
    const controller = new AbortController();
    answerRequest = controller;
    explainButton.disabled = true;
    answerCancel.hidden = false;
    const started = Date.now();
    const timer = setInterval(() => {
      answerStatus.textContent = '课件已定位；正在生成解析（' + Math.floor((Date.now() - started) / 1000) + ' 秒）';
    }, 1000);
    const deadline = setTimeout(() => controller.abort('timeout'), 190000);
    try {
      const response = await fetch('/api/ask', {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({question}), signal: controller.signal
      });
      const data = await response.json();
      if (!response.ok) throw Error(data.error || '生成解析失败');
      // Model results must never replace the located note pages.
      setAnswer(data.answer || '未生成答案', '答案 / 解析');
      answerStatus.textContent = '解析完成；课件定位结果保持不变';
    } catch (error) {
      // Keep results, selected lecture, and preview intact on all model failures.
      answerStatus.textContent = isAbort(error, controller)
        ? (controller.signal.reason === 'timeout' ? '解析超时；课件定位结果仍可浏览' : '已取消解析；课件定位结果仍可浏览')
        : '解析失败；课件定位结果仍可浏览';
    } finally {
      clearInterval(timer);
      clearTimeout(deadline);
      if (answerRequest === controller) {
        answerRequest = null;
        explainButton.disabled = false;
        answerCancel.hidden = true;
      }
    }
  };
})();

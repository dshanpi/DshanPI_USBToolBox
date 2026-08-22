// Load example source into <code data-src>. textContent keeps the downloaded
// source inert and avoids turning examples into executable HTML.
document.querySelectorAll('code[data-src]').forEach(async (element) => {
  const source = element.dataset.src;
  if (!source) return;
  try {
    const response = await fetch(source);
    element.textContent = response.ok
      ? await response.text()
      : `（示例加载失败：${response.status} ${source}）`;
  } catch (error) {
    element.textContent = `（示例加载失败：${String(error)}）`;
  }
});

import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const NODE_NAME = "Qwen21PromptTemplate";

// 扩展注册阶段先取回双语模板表，节点回调保持同步
let TEMPLATES = null; // { names_zh, names_en, map }

async function loadTemplates() {
  try {
    const res = await api.fetchApi("/qwen21_prompt_templates/map");
    TEMPLATES = await res.json();
  } catch (err) {
    console.warn("[qwen21] 提示词模板表加载失败:", err);
    TEMPLATES = { names_zh: [], names_en: [], map: {} };
  }
}

function namesFor(language) {
  return language === "English" ? TEMPLATES.names_en : TEMPLATES.names_zh;
}

function fillPrompts(node, name) {
  const item = TEMPLATES.map?.[name];
  if (!item) return;
  const positiveWidget = node.widgets?.find((w) => w.name === "positive");
  const negativeWidget = node.widgets?.find((w) => w.name === "negative");
  if (!positiveWidget || !negativeWidget) return;

  positiveWidget.value = item.positive;
  negativeWidget.value = item.negative;
  positiveWidget.callback?.(positiveWidget.value);
  negativeWidget.callback?.(negativeWidget.value);
  node.setDirtyCanvas?.(true, true);
  app.graph?.setDirtyCanvas?.(true, true);
}

// 切换语种：替换下拉列表，并尽量把当前模板切到对应语种的同一条目
function applyLanguage(node, language, refill) {
  const templateWidget = node.widgets?.find((w) => w.name === "template");
  if (!templateWidget) return;

  const names = namesFor(language);
  if (!names.length) return;

  if (templateWidget.options) {
    templateWidget.options.values = names.slice();
  }

  if (!names.includes(templateWidget.value)) {
    const pair = TEMPLATES.map?.[templateWidget.value]?.pair;
    templateWidget.value = pair && names.includes(pair) ? pair : names[0];
  }

  if (refill) fillPrompts(node, templateWidget.value);
  node.setDirtyCanvas?.(true, true);
}

app.registerExtension({
  name: "qwen21.prompt.templates",
  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== NODE_NAME) return;

    if (!TEMPLATES) await loadTemplates();

    const onNodeCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      const result = onNodeCreated?.apply(this, arguments);
      const node = this;

      const languageWidget = node.widgets?.find((w) => w.name === "language");
      const templateWidget = node.widgets?.find((w) => w.name === "template");
      const positiveWidget = node.widgets?.find((w) => w.name === "positive");
      const negativeWidget = node.widgets?.find((w) => w.name === "negative");
      if (!languageWidget || !templateWidget || !positiveWidget || !negativeWidget) return result;

      languageWidget.label = "语种";
      templateWidget.label = "模板";
      positiveWidget.label = "正向提示词";
      negativeWidget.label = "负向提示词";

      applyLanguage(node, languageWidget.value, true);

      const originalLanguageCallback = languageWidget.callback;
      languageWidget.callback = function (value, ...args) {
        applyLanguage(node, value, true);
        return originalLanguageCallback?.apply(this, [value, ...args]);
      };

      const originalTemplateCallback = templateWidget.callback;
      templateWidget.callback = function (value, ...args) {
        fillPrompts(node, value);
        return originalTemplateCallback?.apply(this, [value, ...args]);
      };

      return result;
    };

    // 载入已保存的工作流时只同步下拉列表，不覆盖用户改过的提示词
    const onConfigure = nodeType.prototype.onConfigure;
    nodeType.prototype.onConfigure = function (info) {
      const result = onConfigure?.apply(this, arguments);
      const languageWidget = this.widgets?.find((w) => w.name === "language");
      if (languageWidget) applyLanguage(this, languageWidget.value, false);
      return result;
    };
  },
});

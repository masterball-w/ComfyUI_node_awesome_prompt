import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const NODE_NAME = "Qwen21PromptTemplate";

// 在扩展注册阶段先取回模板表，节点回调保持同步，避免异步回调在旧前端里失效
let TEMPLATES = null;

async function loadTemplates() {
  try {
    const res = await api.fetchApi("/qwen21_prompt_templates/map");
    TEMPLATES = await res.json();
  } catch (err) {
    console.warn("[qwen21] 提示词模板表加载失败:", err);
    TEMPLATES = {};
  }
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

      const templateWidget = node.widgets?.find((w) => w.name === "template");
      const positiveWidget = node.widgets?.find((w) => w.name === "positive");
      const negativeWidget = node.widgets?.find((w) => w.name === "negative");
      if (!templateWidget || !positiveWidget || !negativeWidget) return result;

      templateWidget.label = "模板";
      positiveWidget.label = "正向提示词";
      negativeWidget.label = "负向提示词";

      const originalCallback = templateWidget.callback;
      templateWidget.callback = function (value, ...args) {
        const item = TEMPLATES?.[value];
        if (item) {
          positiveWidget.value = item.positive;
          negativeWidget.value = item.negative;
          positiveWidget.callback?.(positiveWidget.value);
          negativeWidget.callback?.(negativeWidget.value);
          node.setDirtyCanvas?.(true, true);
          app.graph?.setDirtyCanvas?.(true, true);
        }
        return originalCallback?.apply(this, [value, ...args]);
      };

      return result;
    };
  },
});

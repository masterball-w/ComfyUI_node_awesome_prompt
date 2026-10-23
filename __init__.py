import json
import os

from aiohttp import web
from server import PromptServer

NODE_DIR = os.path.dirname(__file__)

with open(os.path.join(NODE_DIR, "prompts.json"), encoding="utf-8") as f:
    _TEMPLATES = json.load(f)["templates"]

TEMPLATE_NAMES = [t["name"] for t in _TEMPLATES]
TEMPLATE_MAP = {
    t["name"]: {"positive": t["positive"], "negative": t["negative"]}
    for t in _TEMPLATES
}


class Qwen21PromptTemplate:
    """按模板下拉框载入正/负提示词，再用 Qwen-Image 2.1 的文本编码器编码。"""

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "clip": ("CLIP",),
                "template": (TEMPLATE_NAMES, {"default": TEMPLATE_NAMES[0]}),
                "positive": ("STRING", {"multiline": True, "default": ""}),
                "negative": ("STRING", {"multiline": True, "default": ""}),
            }
        }

    RETURN_TYPES = ("CONDITIONING", "CONDITIONING")
    RETURN_NAMES = ("positive", "negative")
    FUNCTION = "encode"
    CATEGORY = "conditioning/qwen image"
    DESCRIPTION = "选择中文提示词模板后自动载入正向/负向提示词，可继续手动修改；使用 Qwen-Image 2.1 的编码模板。"

    def encode(self, clip, template, positive, negative):
        item = TEMPLATE_MAP.get(template, {})
        positive = positive.strip() or item.get("positive", "")
        negative = negative.strip() or item.get("negative", "")
        pos = clip.encode_from_tokens_scheduled(
            clip.tokenize(positive, images=[], keep_vision=True, prevent_empty_text=True)
        )
        neg = clip.encode_from_tokens_scheduled(
            clip.tokenize(negative, images=[], keep_vision=True, prevent_empty_text=True)
        )
        return (pos, neg)


NODE_CLASS_MAPPINGS = {"Qwen21PromptTemplate": Qwen21PromptTemplate}
NODE_DISPLAY_NAME_MAPPINGS = {"Qwen21PromptTemplate": "Qwen 2.1 提示词模板"}
WEB_DIRECTORY = "./web"


@PromptServer.instance.routes.get("/qwen21_prompt_templates/map")
async def _qwen21_template_map(request):
    return web.json_response(TEMPLATE_MAP)

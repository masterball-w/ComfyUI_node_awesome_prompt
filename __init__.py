import json
import os

from aiohttp import web
from server import PromptServer

NODE_DIR = os.path.dirname(__file__)

with open(os.path.join(NODE_DIR, "prompts.json"), encoding="utf-8") as f:
    _TEMPLATES = json.load(f)["templates"]

NAMES_ZH = [t["name_zh"] for t in _TEMPLATES]
NAMES_EN = [t["name_en"] for t in _TEMPLATES]

# 下拉框同时接受中英文名称，前端按语种过滤显示
TEMPLATE_MAP = {}
for _t in _TEMPLATES:
    TEMPLATE_MAP[_t["name_zh"]] = {
        "lang": "中文",
        "positive": _t["positive_zh"],
        "negative": _t["negative_zh"],
        "pair": _t["name_en"],
    }
    TEMPLATE_MAP[_t["name_en"]] = {
        "lang": "English",
        "positive": _t["positive_en"],
        "negative": _t["negative_en"],
        "pair": _t["name_zh"],
    }


class Qwen21PromptTemplate:
    """按模板下拉框载入正/负提示词，再用 Qwen-Image 2.1 的文本编码器编码。"""

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "clip": ("CLIP",),
                "language": (["中文", "English"], {"default": "中文"}),
                "template": (NAMES_ZH + NAMES_EN, {"default": NAMES_ZH[0]}),
                "positive": ("STRING", {"multiline": True, "default": ""}),
                "negative": ("STRING", {"multiline": True, "default": ""}),
            }
        }

    RETURN_TYPES = ("CONDITIONING", "CONDITIONING")
    RETURN_NAMES = ("positive", "negative")
    FUNCTION = "encode"
    CATEGORY = "conditioning/qwen image"
    DESCRIPTION = "选择语种与中文/英文提示词模板，自动载入正向/负向提示词，可继续手动修改；使用 Qwen-Image 2.1 的编码模板。"

    def encode(self, clip, language, template, positive, negative):
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
    return web.json_response({
        "names_zh": NAMES_ZH,
        "names_en": NAMES_EN,
        "map": TEMPLATE_MAP,
    })

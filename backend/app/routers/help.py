import io

from fastapi import APIRouter

from ..cli import build_parser

router = APIRouter(prefix="/help", tags=["help"])


@router.get("")
def help_text():
    parser = build_parser()
    buffer = io.StringIO()
    parser.print_help(buffer)
    return {"help": buffer.getvalue()}

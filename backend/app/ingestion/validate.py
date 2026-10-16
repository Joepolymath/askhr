"""Detect file type from content (magic bytes), not just the extension.

We avoid libmagic: the four supported formats are easy to recognise directly,
and a missing system library is one less thing to break in deployment.
"""
import io
import zipfile
from pathlib import PurePath

PDF = "application/pdf"
DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
TXT = "text/plain"
MD = "text/markdown"

EXTENSIONS = {".pdf": PDF, ".docx": DOCX, ".txt": TXT, ".md": MD, ".markdown": MD}


class FileRejected(ValueError):
    """Raised with a message that is safe to show to the admin."""


def _looks_like_docx(data: bytes) -> bool:
    if not data.startswith(b"PK\x03\x04"):
        return False
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as zf:
            return "word/document.xml" in zf.namelist()
    except zipfile.BadZipFile:
        return False


def _looks_like_text(data: bytes) -> bool:
    if b"\x00" in data:
        return False
    try:
        data.decode("utf-8-sig")
    except UnicodeDecodeError:
        return False
    return True


def detect_type(data: bytes, filename: str) -> str:
    """Return the MIME type, or raise FileRejected if content and extension disagree."""
    ext = PurePath(filename).suffix.lower()
    expected = EXTENSIONS.get(ext)
    if expected is None:
        raise FileRejected(f"Unsupported file type '{ext or filename}'. Use PDF, DOCX, TXT or MD.")
    if not data:
        raise FileRejected("The file is empty.")

    if expected == PDF:
        ok = data[:1024].lstrip().startswith(b"%PDF-")
    elif expected == DOCX:
        ok = _looks_like_docx(data)
    else:
        ok = _looks_like_text(data)

    if not ok:
        raise FileRejected(f"The file contents don't match its '{ext}' extension.")
    return expected

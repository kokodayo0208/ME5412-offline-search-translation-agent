"""ME5412 Offline Exam Search.

No Internet services, API calls, or downloaded models are used.  The program
reads text from local PDFs (PyMuPDF) and PPTX files (ZIP/XML) and keeps a
small, local JSON cache beside this script.
"""

from __future__ import annotations

import html
import json
import math
import os
import re
import sys
import threading
import time
import unicodedata
import zipfile
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any
import tkinter as tk
from tkinter import filedialog, messagebox, ttk

try:
    import fitz  # PyMuPDF
except ImportError as exc:  # Friendly startup message on unusual installations
    raise SystemExit("This program needs PyMuPDF (fitz), which is not available.") from exc


APP_DIR = Path(__file__).resolve().parent
CACHE_FILE = APP_DIR / "offline_index.json"
DEFAULT_FOLDER = APP_DIR.parent
SUPPORTED_SUFFIXES = {".pdf", ".pptx"}
MAX_TEXT = 120_000
ENGLISH_STOPWORDS = {
    "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "how", "in",
    "is", "it", "of", "on", "or", "the", "to", "was", "were", "what", "when", "which",
    "with", "will", "would", "can", "could", "should", "this", "that", "these", "those",
}


def normalized(text: str) -> str:
    return unicodedata.normalize("NFKC", text).lower()


def stem(word: str) -> str:
    """Very small offline stemmer, enough to match rehabilitation/rehabilitate."""
    if len(word) > 5 and word.endswith("ies"):
        return word[:-3] + "y"
    for suffix in ("tion", "ment", "ness", "ingly", "edly", "ing", "ed", "es", "s"):
        if len(word) > len(suffix) + 3 and word.endswith(suffix):
            return word[: -len(suffix)]
    return word


def tokenize(text: str) -> list[str]:
    """Return English words and Chinese single-character + two-character terms."""
    text = normalized(text)
    words = [stem(w) for w in re.findall(r"[a-z][a-z0-9_+\-]*", text)]
    words = [w for w in words if w not in ENGLISH_STOPWORDS]
    chinese_runs = re.findall(r"[\u3400-\u9fff]+", text)
    for run in chinese_runs:
        words.extend(run)  # short queries such as “中风” still match
        words.extend(run[i : i + 2] for i in range(len(run) - 1))
    return words


def clean_text(text: str) -> str:
    text = html.unescape(text)
    text = re.sub(r"[\t\r\f\v]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return re.sub(r" {2,}", " ", text).strip()


def read_pdf(path: Path) -> list[dict[str, Any]]:
    pages: list[dict[str, Any]] = []
    with fitz.open(path) as doc:
        for number, page in enumerate(doc, 1):
            pages.append({"number": number, "text": clean_text(page.get_text("text")[:MAX_TEXT])})
    return pages


def read_pptx(path: Path) -> list[dict[str, Any]]:
    """Extract visible slide text using only standard ZIP/XML libraries."""
    pages: list[dict[str, Any]] = []
    with zipfile.ZipFile(path) as package:
        names = set(package.namelist())
        slide_names = [n for n in names if re.fullmatch(r"ppt/slides/slide\d+\.xml", n)]
        slide_names.sort(key=lambda n: int(re.search(r"\d+", Path(n).stem).group()))
        for number, name in enumerate(slide_names, 1):
            raw = package.read(name).decode("utf-8", errors="ignore")
            pieces = re.findall(r"<a:t>(.*?)</a:t>", raw, flags=re.DOTALL)
            # Text in adjacent runs belongs together; a newline is still clearer
            # than concatenating every shape into one long word stream.
            text = clean_text("\n".join(html.unescape(re.sub(r"<.*?>", "", p)) for p in pieces))
            pages.append({"number": number, "text": text[:MAX_TEXT]})
    return pages


def file_signature(path: Path) -> dict[str, Any]:
    stat = path.stat()
    return {"size": stat.st_size, "mtime_ns": stat.st_mtime_ns}


class LocalIndex:
    def __init__(self) -> None:
        self.folder = DEFAULT_FOLDER
        self.data: dict[str, Any] = {"version": 1, "folder": "", "files": []}
        self.df: Counter[str] = Counter()
        self.doc_count = 0
        self.load()

    def load(self) -> None:
        if not CACHE_FILE.exists():
            return
        try:
            self.data = json.loads(CACHE_FILE.read_text(encoding="utf-8"))
            self.folder = Path(self.data.get("folder") or DEFAULT_FOLDER)
            self._build_statistics()
        except (OSError, json.JSONDecodeError):
            self.data = {"version": 1, "folder": "", "files": []}

    def save(self) -> None:
        self.data["folder"] = str(self.folder)
        self.data["saved_at"] = time.strftime("%Y-%m-%d %H:%M:%S")
        CACHE_FILE.write_text(json.dumps(self.data, ensure_ascii=False), encoding="utf-8")

    def _build_statistics(self) -> None:
        self.df = Counter()
        self.doc_count = 0
        for source in self.data.get("files", []):
            for page in source.get("pages", []):
                tokens = set(page.get("terms", {}))
                self.df.update(tokens)
                self.doc_count += 1

    def source_files(self) -> list[Path]:
        if not self.folder.exists():
            return []
        return sorted(
            (p for p in self.folder.rglob("*") if p.is_file() and p.suffix.lower() in SUPPORTED_SUFFIXES),
            key=lambda p: str(p).lower(),
        )

    def build(self, folder: Path, progress: Any | None = None) -> tuple[int, list[str]]:
        self.folder = folder.resolve()
        old = {item["path"]: item for item in self.data.get("files", [])}
        found = self.source_files()
        new_files: list[dict[str, Any]] = []
        warnings: list[str] = []
        reused = 0
        for position, path in enumerate(found, 1):
            if progress:
                progress(position, len(found), path.name)
            key = str(path.resolve())
            signature = file_signature(path)
            previous = old.get(key)
            if previous and previous.get("signature") == signature:
                new_files.append(previous)
                reused += 1
                continue
            try:
                pages = read_pdf(path) if path.suffix.lower() == ".pdf" else read_pptx(path)
                for page in pages:
                    counts = Counter(tokenize(page["text"]))
                    page["terms"] = dict(counts)
                new_files.append({
                    "path": key, "name": path.name, "kind": path.suffix[1:].upper(),
                    "signature": signature, "pages": pages,
                })
            except Exception as exc:  # a damaged file should not stop an exam search
                warnings.append(f"{path.name}: {exc}")
        self.data = {"version": 1, "folder": str(self.folder), "files": new_files}
        self._build_statistics()
        self.save()
        return reused, warnings

    def search(self, query: str, limit: int = 100) -> list[dict[str, Any]]:
        terms = tokenize(query)
        if not terms:
            return []
        query_counts = Counter(terms)
        results: list[dict[str, Any]] = []
        q_plain = normalized(query)
        for source in self.data.get("files", []):
            for page in source.get("pages", []):
                counts = page.get("terms", {})
                length = sum(counts.values()) or 1
                score = 0.0
                matched: list[str] = []
                for term, qtf in query_counts.items():
                    tf = counts.get(term, 0)
                    if tf:
                        idf = math.log((self.doc_count + 1) / (self.df.get(term, 0) + 1)) + 1
                        score += (1 + math.log(tf)) * idf * qtf
                        matched.append(term)
                # Exact question wording and filename terms get a modest boost.
                if q_plain and q_plain in normalized(page.get("text", "")):
                    score += 5
                if any(t in normalized(source["name"]) for t in query_counts):
                    score += 1.5
                if score:
                    score /= 1 + 0.15 * math.log(length)
                    results.append({**source, "page": page, "score": score, "matched": matched})
        return sorted(results, key=lambda x: x["score"], reverse=True)[:limit]


class SearchApp(tk.Tk):
    def __init__(self) -> None:
        super().__init__()
        self.title("ME5412 离线课件检索")
        self.geometry("1300x820")
        self.minsize(1000, 650)
        self.index = LocalIndex()
        self.results: list[dict[str, Any]] = []
        self.preview_image: tk.PhotoImage | None = None
        self._build_ui()
        self.folder_var.set(str(self.index.folder))
        self.status_var.set("请选择资料文件夹并建立索引。程序全程离线。")
        if self.index.data.get("files"):
            self.status_var.set(self._index_status())

    def _build_ui(self) -> None:
        outer = ttk.Frame(self, padding=12)
        outer.pack(fill="both", expand=True)
        top = ttk.Frame(outer)
        top.pack(fill="x")
        self.folder_var = tk.StringVar()
        ttk.Label(top, text="资料文件夹：").pack(side="left")
        ttk.Entry(top, textvariable=self.folder_var, state="readonly").pack(side="left", fill="x", expand=True, padx=6)
        ttk.Button(top, text="选择文件夹", command=self.choose_folder).pack(side="left")
        self.index_button = ttk.Button(top, text="建立/更新索引", command=self.start_indexing)
        self.index_button.pack(side="left", padx=(6, 0))

        search_bar = ttk.Frame(outer)
        search_bar.pack(fill="x", pady=(10, 8))
        ttk.Label(search_bar, text="题目或关键词：").pack(side="left")
        self.query_var = tk.StringVar()
        self.query_entry = ttk.Entry(search_bar, textvariable=self.query_var, font=("Segoe UI", 12))
        self.query_entry.pack(side="left", fill="x", expand=True, padx=6)
        self.query_entry.bind("<Return>", lambda _event: self.run_search())
        ttk.Button(search_bar, text="搜索", command=self.run_search).pack(side="left")
        ttk.Button(search_bar, text="清空", command=self.clear_search).pack(side="left", padx=(6, 0))

        main = ttk.PanedWindow(outer, orient="horizontal")
        main.pack(fill="both", expand=True)
        left = ttk.Frame(main, padding=(0, 0, 8, 0))
        right = ttk.Frame(main)
        main.add(left, weight=4)
        main.add(right, weight=6)

        ttk.Label(left, text="匹配结果（双击查看）").pack(anchor="w")
        self.tree = ttk.Treeview(left, columns=("score", "source", "page"), show="headings", selectmode="browse")
        self.tree.heading("score", text="相关度")
        self.tree.heading("source", text="课件")
        self.tree.heading("page", text="页")
        self.tree.column("score", width=65, stretch=False, anchor="center")
        self.tree.column("source", width=330)
        self.tree.column("page", width=55, stretch=False, anchor="center")
        tree_scroll = ttk.Scrollbar(left, orient="vertical", command=self.tree.yview)
        self.tree.configure(yscrollcommand=tree_scroll.set)
        self.tree.pack(side="left", fill="both", expand=True)
        tree_scroll.pack(side="right", fill="y")
        self.tree.bind("<<TreeviewSelect>>", self.show_selected)
        self.tree.bind("<Double-1>", self.show_selected)

        right_top = ttk.Frame(right)
        right_top.pack(fill="x")
        self.result_title = ttk.Label(right_top, text="选择左侧结果查看内容", font=("Segoe UI", 12, "bold"))
        self.result_title.pack(side="left")
        self.open_button = ttk.Button(right_top, text="打开原文件", command=self.open_source, state="disabled")
        self.open_button.pack(side="right")
        self.preview_note = ttk.Label(right, text="PDF 会在此显示页预览；PPTX 显示可搜索的文字内容。", foreground="#555")
        self.preview_note.pack(anchor="w", pady=(3, 5))

        body = ttk.PanedWindow(right, orient="vertical")
        body.pack(fill="both", expand=True)
        image_frame = ttk.Frame(body)
        text_frame = ttk.Frame(body)
        body.add(image_frame, weight=4)
        body.add(text_frame, weight=5)
        self.preview_label = ttk.Label(image_frame, anchor="center", justify="center")
        self.preview_label.pack(fill="both", expand=True)
        self.text = tk.Text(text_frame, wrap="word", font=("Microsoft YaHei UI", 10), padx=10, pady=8)
        text_scroll = ttk.Scrollbar(text_frame, orient="vertical", command=self.text.yview)
        self.text.configure(yscrollcommand=text_scroll.set, state="disabled")
        self.text.pack(side="left", fill="both", expand=True)
        text_scroll.pack(side="right", fill="y")

        self.status_var = tk.StringVar()
        ttk.Separator(outer).pack(fill="x", pady=(8, 4))
        ttk.Label(outer, textvariable=self.status_var, anchor="w").pack(fill="x")

    def _index_status(self) -> str:
        pages = sum(len(f.get("pages", [])) for f in self.index.data.get("files", []))
        return f"已索引 {len(self.index.data.get('files', []))} 个文件、{pages} 页。输入题目或关键词即可搜索。"

    def choose_folder(self) -> None:
        choice = filedialog.askdirectory(initialdir=str(self.index.folder if self.index.folder.exists() else DEFAULT_FOLDER))
        if choice:
            self.index.folder = Path(choice)
            self.folder_var.set(choice)

    def start_indexing(self) -> None:
        folder = Path(self.folder_var.get())
        if not folder.is_dir():
            messagebox.showerror("文件夹不可用", "请选择包含 PDF 或 PPTX 的有效文件夹。")
            return
        self.index_button.configure(state="disabled")
        self.status_var.set("正在读取本地资料，请稍候…")
        def worker() -> None:
            def progress(current: int, total: int, name: str) -> None:
                self.after(0, lambda: self.status_var.set(f"正在索引 {current}/{total}：{name}"))
            try:
                reused, warnings = self.index.build(folder, progress)
                self.after(0, lambda: self.index_finished(reused, warnings))
            except Exception as exc:
                self.after(0, lambda: messagebox.showerror("索引失败", str(exc)))
                self.after(0, lambda: self.index_button.configure(state="normal"))
        threading.Thread(target=worker, daemon=True).start()

    def index_finished(self, reused: int, warnings: list[str]) -> None:
        self.index_button.configure(state="normal")
        message = self._index_status() + (f"（复用 {reused} 个未变化文件）" if reused else "")
        if warnings:
            message += f" {len(warnings)} 个文件未能读取。"
            messagebox.showwarning("部分文件未索引", "\n".join(warnings[:8]))
        self.status_var.set(message)
        self.run_search()

    def run_search(self) -> None:
        query = self.query_var.get().strip()
        for item in self.tree.get_children():
            self.tree.delete(item)
        self.results = []
        self.clear_preview()
        if not query:
            self.status_var.set(self._index_status() if self.index.data.get("files") else "请先建立索引，然后输入题目或关键词。")
            return
        if not self.index.data.get("files"):
            messagebox.showinfo("还没有索引", "请先点击“建立/更新索引”。")
            return
        self.results = self.index.search(query)
        for i, result in enumerate(self.results):
            self.tree.insert("", "end", iid=str(i), values=(f"{result['score']:.1f}", result["name"], result["page"]["number"]))
        if self.results:
            self.tree.selection_set("0")
            self.tree.focus("0")
            self.show_selected()
            self.status_var.set(f"找到 {len(self.results)} 个可能相关的页面，已按相关度排序。")
        else:
            self.status_var.set("没有找到匹配。可尝试更短的中英文关键词，或先更新索引。")

    def clear_search(self) -> None:
        self.query_var.set("")
        self.run_search()
        self.query_entry.focus_set()

    def selected_result(self) -> dict[str, Any] | None:
        selection = self.tree.selection()
        return self.results[int(selection[0])] if selection else None

    def clear_preview(self) -> None:
        self.preview_label.configure(image="", text="")
        self.preview_image = None
        self.result_title.configure(text="选择左侧结果查看内容")
        self.open_button.configure(state="disabled")
        self.text.configure(state="normal")
        self.text.delete("1.0", "end")
        self.text.configure(state="disabled")

    def show_selected(self, _event: Any = None) -> None:
        result = self.selected_result()
        if not result:
            return
        page = result["page"]
        self.result_title.configure(text=f"{result['name']}  ·  第 {page['number']} 页/张")
        self.open_button.configure(state="normal")
        self.text.configure(state="normal")
        self.text.delete("1.0", "end")
        self.text.insert("1.0", page.get("text") or "（此页没有可提取的文字，可能是图片课件。）")
        self.highlight_terms(result.get("matched", []))
        self.text.configure(state="disabled")
        if result["kind"] == "PDF":
            self.render_pdf_preview(Path(result["path"]), page["number"])
        else:
            self.preview_image = None
            self.preview_label.configure(image="", text="PPTX：此版本使用本地文字解析。\n请点击“打开原文件”查看原始幻灯片。")

    def highlight_terms(self, terms: list[str]) -> None:
        self.text.tag_remove("hit", "1.0", "end")
        self.text.tag_configure("hit", background="#fff19c")
        if not terms:
            return
        content = self.text.get("1.0", "end-1c").lower()
        for term in sorted(set(terms), key=len, reverse=True):
            start = 0
            while True:
                found = content.find(term.lower(), start)
                if found < 0:
                    break
                first = f"1.0+{found}c"
                last = f"1.0+{found + len(term)}c"
                self.text.tag_add("hit", first, last)
                start = found + len(term)

    def render_pdf_preview(self, path: Path, number: int) -> None:
        try:
            with fitz.open(path) as doc:
                page = doc[number - 1]
                pix = page.get_pixmap(matrix=fitz.Matrix(1.25, 1.25), alpha=False)
                image = tk.PhotoImage(data=pix.tobytes("png"))
            self.preview_image = image  # retain the reference so Tk does not discard it
            self.preview_label.configure(image=image, text="")
        except Exception as exc:
            self.preview_image = None
            self.preview_label.configure(image="", text=f"无法生成 PDF 预览：{exc}")

    def open_source(self) -> None:
        result = self.selected_result()
        if not result:
            return
        try:
            os.startfile(result["path"])  # Windows: opens the user's normal viewer, entirely offline
        except OSError as exc:
            messagebox.showerror("无法打开文件", str(exc))


if __name__ == "__main__":
    app = SearchApp()
    app.mainloop()

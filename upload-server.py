#!/usr/bin/env python3
"""Local upload receiver for paper-download-crx.

The Chrome extension posts selected working-paper downloads here. The service
stores uploaded files under ``~/paper-upload-work/uploads`` by default.
"""

from __future__ import annotations

import argparse
import cgi
import json
import mimetypes
import re
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, quote, unquote, urlparse


DEFAULT_HOST = "0.0.0.0"
DEFAULT_PORT = 8766
DEFAULT_UPLOAD_DIR = Path.home() / "paper-upload-work" / "uploads"
DEFAULT_PROJECT_NAME = "未分项目"


def _safe_name(name: str, fallback: str) -> str:
    raw = (name or "").strip() or fallback
    raw = re.sub(r"[/\\:]+", "_", raw)
    safe = re.sub(r'[<>:"|?*]+', "_", raw).strip()
    return safe or fallback


def _safe_project_name(name: str) -> str:
    return _safe_name(name, DEFAULT_PROJECT_NAME)


def _list_from_json_text(value: str | None) -> list[Any]:
    if not value:
        return []
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError:
        return []
    return parsed if isinstance(parsed, list) else []


def _first_text(*values: Any) -> str:
    for value in values:
        if isinstance(value, str) and value.strip():
            return value.strip()
    return ""


class UploadHandler(BaseHTTPRequestHandler):
    server_version = "PaperUploadServer/0.1"

    def _send_json(self, status: int, payload: dict[str, Any]) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_html(self, status: int, html_text: str) -> None:
        body = html_text.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_file(self, path: Path, download_name: str | None = None) -> None:
        content_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(path.stat().st_size))
        if download_name:
            ascii_name = re.sub(r"[^A-Za-z0-9._()-]+", "_", download_name) or "download"
            utf8_name = quote(download_name, safe="")
            self.send_header(
                "Content-Disposition",
                f'attachment; filename="{ascii_name}"; filename*=UTF-8\'\'{utf8_name}',
            )
        self.end_headers()
        with path.open("rb") as fh:
            while True:
                chunk = fh.read(1024 * 1024)
                if not chunk:
                    break
                self.wfile.write(chunk)

    def _upload_root(self) -> Path:
        return self.server.upload_dir  # type: ignore[attr-defined]

    def _resolve_uploaded_path(self, relative_path: str) -> Path | None:
        upload_root = self._upload_root()
        candidate = (upload_root / unquote(relative_path)).resolve()
        try:
            candidate.relative_to(upload_root)
        except ValueError:
            return None
        return candidate

    def _read_metadata(self, batch_dir: Path) -> dict[str, Any]:
        metadata_path = batch_dir / "metadata.json"
        metadata: dict[str, Any] = {}
        if metadata_path.exists():
            try:
                metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                metadata = {"error": "metadata read failed"}
        return metadata

    def _project_from_payload(self, payload: dict[str, Any]) -> str:
        for key in ("projectName", "project", "folderName"):
            value = payload.get(key)
            if isinstance(value, str) and value.strip():
                return _safe_project_name(value)
        return DEFAULT_PROJECT_NAME

    def _batch_info(self, batch_dir: Path, project_name: str) -> dict[str, Any]:
        upload_root = self._upload_root()

        metadata = self._read_metadata(batch_dir)
        metadata.setdefault("projectName", project_name)

        files = []
        total_size = 0
        for file_path in sorted(p for p in batch_dir.iterdir() if p.is_file() and p.name != "metadata.json"):
            stat = file_path.stat()
            total_size += stat.st_size
            rel_path = file_path.relative_to(upload_root).as_posix()
            files.append({
                "name": file_path.name,
                "path": rel_path,
                "size": stat.st_size,
                "modifiedAt": datetime.fromtimestamp(stat.st_mtime).isoformat(timespec="seconds"),
                "downloadUrl": f"/files/{rel_path}",
            })

        return {
            "name": batch_dir.name,
            "projectName": project_name,
            "createdAt": datetime.fromtimestamp(batch_dir.stat().st_mtime).isoformat(timespec="seconds"),
            "fileCount": len(files),
            "totalSize": total_size,
            "metadata": metadata,
            "files": files,
        }

    def _list_projects(self) -> list[dict[str, Any]]:
        upload_root = self._upload_root()
        project_map: dict[str, dict[str, Any]] = {}

        def add_batch(project_name: str, batch_dir: Path) -> None:
            project = project_map.setdefault(project_name, {
                "name": project_name,
                "batchCount": 0,
                "fileCount": 0,
                "totalSize": 0,
                "batches": [],
            })
            batch = self._batch_info(batch_dir, project_name)
            project["batches"].append(batch)
            project["batchCount"] += 1
            project["fileCount"] += batch["fileCount"]
            project["totalSize"] += batch["totalSize"]

        for item in sorted((p for p in upload_root.iterdir() if p.is_dir()), reverse=True):
            if (item / "metadata.json").exists():
                metadata = self._read_metadata(item)
                add_batch(self._project_from_payload(metadata), item)
                continue

            project_name = item.name
            for batch_dir in sorted((p for p in item.iterdir() if p.is_dir() and (p / "metadata.json").exists()), reverse=True):
                add_batch(project_name, batch_dir)

        projects = list(project_map.values())
        for project in projects:
            project["batches"].sort(key=lambda batch: batch["createdAt"], reverse=True)
            created_values = [batch["createdAt"] for batch in project["batches"]]
            project["createdAt"] = max(created_values) if created_values else ""
        projects.sort(key=lambda project: project["createdAt"], reverse=True)
        return projects

    def _list_batches(self) -> list[dict[str, Any]]:
        batches: list[dict[str, Any]] = []
        for project in self._list_projects():
            batches.extend(project["batches"])
        batches.sort(key=lambda batch: batch["createdAt"], reverse=True)
        return batches

    def _make_batch_dir(self, project_name: str = DEFAULT_PROJECT_NAME) -> Path:
        upload_root = self._upload_root()
        target_root = upload_root if project_name == DEFAULT_PROJECT_NAME else upload_root / project_name
        target_root.mkdir(parents=True, exist_ok=True)
        base_name = datetime.now().strftime("%Y%m%d_%H%M%S")
        batch_dir = target_root / base_name
        counter = 2
        while batch_dir.exists():
            batch_dir = target_root / f"{base_name}-{counter}"
            counter += 1
        batch_dir.mkdir(parents=True)
        return batch_dir

    def _index_html(self) -> str:
        return """<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>底稿上传文件</title>
  <style>
    :root { color-scheme: light; --line:#d8dee8; --muted:#607086; --bg:#f6f8fb; --ink:#172033; --brand:#0f766e; --brand2:#2563eb; }
    * { box-sizing: border-box; }
    body { margin: 0; font: 14px/1.5 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: var(--ink); background: var(--bg); }
    header { position: sticky; top: 0; z-index: 2; background: #fff; border-bottom: 1px solid var(--line); }
    .bar { max-width: 1180px; margin: 0 auto; padding: 14px 20px; display: flex; align-items: center; justify-content: space-between; gap: 16px; }
    h1 { margin: 0; font-size: 20px; font-weight: 700; }
    .summary { color: var(--muted); font-size: 13px; }
    button, .button { border: 1px solid var(--line); border-radius: 6px; background: #fff; color: var(--ink); padding: 7px 11px; cursor: pointer; text-decoration: none; }
    button.primary { background: var(--brand); border-color: var(--brand); color: #fff; }
    main { max-width: 1180px; margin: 0 auto; padding: 18px 20px 40px; }
    .tools { display: grid; grid-template-columns: minmax(220px, 1fr) auto; gap: 10px; margin-bottom: 14px; }
    input { width: 100%; border: 1px solid var(--line); border-radius: 6px; padding: 8px 10px; font: inherit; }
    .project { margin: 14px 0 20px; }
    .project-head { padding: 12px 0 8px; display: flex; align-items: baseline; justify-content: space-between; gap: 14px; border-bottom: 2px solid var(--line); }
    .project-title { margin: 0; font-size: 18px; font-weight: 700; }
    .project-meta { color: var(--muted); font-size: 13px; white-space: nowrap; }
    .batch { background: #fff; border: 1px solid var(--line); border-radius: 8px; margin: 12px 0; overflow: hidden; }
    .batch-head { padding: 12px 14px; display: grid; grid-template-columns: 1fr auto; gap: 12px; align-items: center; border-bottom: 1px solid var(--line); }
    .batch-title { font-weight: 700; }
    .meta { color: var(--muted); font-size: 13px; display: flex; flex-wrap: wrap; gap: 10px; margin-top: 3px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 9px 14px; border-bottom: 1px solid #eef2f7; text-align: left; vertical-align: top; }
    th { color: var(--muted); font-size: 12px; font-weight: 600; background: #fbfcfe; }
    tr:last-child td { border-bottom: 0; }
    .name { word-break: break-all; }
    .empty, .error { padding: 28px; text-align: center; color: var(--muted); background: #fff; border: 1px solid var(--line); border-radius: 8px; }
    details { margin: 0 14px 12px; }
    pre { overflow: auto; background: #f8fafc; border: 1px solid var(--line); border-radius: 6px; padding: 10px; color: #334155; }
    a { color: var(--brand2); }
    @media (max-width: 720px) {
      .bar, .batch-head, .tools, .project-head { grid-template-columns: 1fr; display: grid; }
      .project-meta { white-space: normal; }
      table, thead, tbody, tr, th, td { display: block; }
      thead { display: none; }
      td { border-bottom: 0; padding: 7px 14px; }
      tr { border-bottom: 1px solid #eef2f7; padding: 6px 0; }
    }
  </style>
</head>
<body>
  <header>
    <div class="bar">
      <div>
        <h1>底稿上传文件</h1>
        <div id="summary" class="summary">正在加载...</div>
      </div>
      <button id="refresh" class="primary" type="button">刷新</button>
    </div>
  </header>
  <main>
    <div class="tools">
      <input id="filter" type="search" placeholder="按项目、批次、文件名、来源页面筛选" />
      <a class="button" href="/api/uploads" target="_blank" rel="noreferrer">JSON</a>
    </div>
    <div id="content"></div>
  </main>
  <script>
    const content = document.getElementById("content");
    const summary = document.getElementById("summary");
    const filter = document.getElementById("filter");
    let projects = [];

    function formatSize(bytes) {
      if (!bytes) return "0 B";
      const units = ["B", "KB", "MB", "GB"];
      let value = bytes;
      let index = 0;
      while (value >= 1024 && index < units.length - 1) {
        value /= 1024;
        index += 1;
      }
      return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
    }

    function escapeHtml(value) {
      return String(value ?? "").replace(/[&<>"']/g, (char) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
      }[char]));
    }

    function batchMatches(batch, project, query) {
      if (!query) return true;
      const haystack = [
        project.name,
        batch.name,
        batch.projectName,
        batch.metadata && batch.metadata.sourceUrl,
        ...batch.files.map((file) => file.name)
      ].join(" ").toLowerCase();
      return haystack.includes(query);
    }

    function projectMatches(project, query) {
      const batches = project.batches.filter((batch) => batchMatches(batch, project, query));
      return { ...project, batches };
    }

    function render() {
      const query = filter.value.trim().toLowerCase();
      const visible = projects.map((project) => projectMatches(project, query)).filter((project) => project.batches.length);
      const batchCount = projects.reduce((sum, project) => sum + project.batchCount, 0);
      const fileCount = projects.reduce((sum, project) => sum + project.fileCount, 0);
      const totalSize = projects.reduce((sum, project) => sum + project.totalSize, 0);
      summary.textContent = `${projects.length} 个项目，${batchCount} 个批次，${fileCount} 个文件，${formatSize(totalSize)}`;

      if (!visible.length) {
        content.innerHTML = '<div class="empty">暂无匹配的上传文件</div>';
        return;
      }

      content.innerHTML = visible.map((project) => {
        const projectFileCount = project.batches.reduce((sum, batch) => sum + batch.fileCount, 0);
        const projectTotalSize = project.batches.reduce((sum, batch) => sum + batch.totalSize, 0);
        const batchesHtml = project.batches.map((batch) => {
        const sourceUrl = batch.metadata && batch.metadata.sourceUrl ? batch.metadata.sourceUrl : "";
        const rows = batch.files.map((file) => `
          <tr>
            <td class="name">${escapeHtml(file.name)}</td>
            <td>${formatSize(file.size)}</td>
            <td>${escapeHtml(file.modifiedAt)}</td>
            <td><a href="${encodeURI(file.downloadUrl)}">下载</a></td>
          </tr>
        `).join("");
        return `
          <section class="batch">
            <div class="batch-head">
              <div>
                <div class="batch-title">${escapeHtml(batch.name)}</div>
                <div class="meta">
                  <span>${escapeHtml(batch.createdAt)}</span>
                  <span>${batch.fileCount} 个文件</span>
                  <span>${formatSize(batch.totalSize)}</span>
                  ${sourceUrl ? `<a href="${escapeHtml(sourceUrl)}" target="_blank" rel="noreferrer">来源页面</a>` : ""}
                </div>
              </div>
              <a class="button" href="/api/uploads?batch=${encodeURIComponent(batch.name)}" target="_blank" rel="noreferrer">元数据</a>
            </div>
            <table>
              <thead><tr><th>文件名</th><th>大小</th><th>上传时间</th><th>操作</th></tr></thead>
              <tbody>${rows || '<tr><td colspan="4">这个批次没有文件</td></tr>'}</tbody>
            </table>
            <details>
              <summary>查看 metadata.json</summary>
              <pre>${escapeHtml(JSON.stringify(batch.metadata || {}, null, 2))}</pre>
            </details>
          </section>
        `;
        }).join("");
        return `
          <section class="project">
            <div class="project-head">
              <h2 class="project-title">${escapeHtml(project.name)}</h2>
              <div class="project-meta">${project.batches.length} 个批次，${projectFileCount} 个文件，${formatSize(projectTotalSize)}</div>
            </div>
            ${batchesHtml}
          </section>
        `;
      }).join("");
    }

    async function load() {
      content.innerHTML = '<div class="empty">正在加载...</div>';
      try {
        const response = await fetch("/api/uploads", { cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (Array.isArray(data.projects)) {
          projects = data.projects;
        } else {
          projects = [{ name: "未分项目", batchCount: (data.batches || []).length, fileCount: (data.batches || []).reduce((sum, batch) => sum + batch.fileCount, 0), totalSize: (data.batches || []).reduce((sum, batch) => sum + batch.totalSize, 0), batches: data.batches || [] }];
        }
        render();
      } catch (error) {
        content.innerHTML = `<div class="error">加载失败：${escapeHtml(error.message || error)}</div>`;
      }
    }

    document.getElementById("refresh").addEventListener("click", load);
    filter.addEventListener("input", render);
    load();
  </script>
</body>
</html>"""

    def do_OPTIONS(self) -> None:
        self._send_json(200, {"ok": True})

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/") or "/"

        if path == "/health":
            self._send_json(200, {"ok": True})
            return

        if path == "/":
            self._send_html(200, self._index_html())
            return

        if path == "/api/uploads":
            query = parse_qs(parsed.query)
            projects = self._list_projects()
            batches = self._list_batches()
            project_name = query.get("project", [""])[0]
            batch_name = query.get("batch", [""])[0]
            if project_name:
                projects = [project for project in projects if project["name"] == project_name]
                batches = [batch for batch in batches if batch["projectName"] == project_name]
            if batch_name:
                batches = [batch for batch in batches if batch["name"] == batch_name]
                projects = [
                    {**project, "batches": [batch for batch in project["batches"] if batch["name"] == batch_name]}
                    for project in projects
                ]
                projects = [project for project in projects if project["batches"]]
            self._send_json(200, {"ok": True, "projects": projects, "batches": batches})
            return

        if path.startswith("/files/"):
            file_path = self._resolve_uploaded_path(path.removeprefix("/files/"))
            if not file_path or not file_path.is_file():
                self._send_json(404, {"ok": False, "error": "file not found"})
                return
            self._send_file(file_path, file_path.name)
            return

        self._send_json(404, {"ok": False, "error": "not found"})

    def do_POST(self) -> None:
        if self.path.rstrip("/") != "/upload":
            self._send_json(404, {"ok": False, "error": "not found"})
            return

        content_type = self.headers.get("content-type", "")
        if "multipart/form-data" not in content_type:
            self._send_json(400, {"ok": False, "error": "expected multipart/form-data"})
            return

        form = cgi.FieldStorage(
            fp=self.rfile,
            headers=self.headers,
            environ={
                "REQUEST_METHOD": "POST",
                "CONTENT_TYPE": content_type,
            },
        )

        payload_text = form.getfirst("payload", "{}")
        try:
            payload = json.loads(payload_text)
        except json.JSONDecodeError:
            payload = {"rawPayload": payload_text}
        if not isinstance(payload, dict):
            payload = {"rawPayload": payload}

        project_name = self._project_from_payload(payload)
        payload["projectName"] = project_name
        batch_dir = self._make_batch_dir(project_name)

        fields = form["files"] if "files" in form else []
        if not isinstance(fields, list):
            fields = [fields]

        items = payload.get("items") if isinstance(payload.get("items"), list) else []
        payload_file_names = payload.get("fileNames") if isinstance(payload.get("fileNames"), list) else []
        form_file_names = _list_from_json_text(form.getfirst("fileNames"))

        saved_files: list[dict[str, Any]] = []
        for index, field in enumerate(fields, start=1):
            if not getattr(field, "file", None):
                continue

            item = items[index - 1] if index - 1 < len(items) and isinstance(items[index - 1], dict) else {}
            original_multipart_name = getattr(field, "filename", "")
            preferred_name = _first_text(
                item.get("fileName"),
                payload_file_names[index - 1] if index - 1 < len(payload_file_names) else "",
                form_file_names[index - 1] if index - 1 < len(form_file_names) else "",
                original_multipart_name,
                f"paper-{index}.bin",
            )
            filename = _safe_name(preferred_name, f"paper-{index}.bin")
            target = batch_dir / filename
            stem = target.stem
            suffix = target.suffix
            counter = 2
            while target.exists():
                target = batch_dir / f"{stem}-{counter}{suffix}"
                counter += 1

            with target.open("wb") as fh:
                while True:
                    chunk = field.file.read(1024 * 1024)
                    if not chunk:
                        break
                    fh.write(chunk)
            saved_name = target.name
            saved_files.append({
                "index": index - 1,
                "savedName": saved_name,
                "path": str(target),
                "originalMultipartName": original_multipart_name,
                "preferredName": preferred_name,
            })

            if index - 1 < len(items) and isinstance(items[index - 1], dict):
                items[index - 1]["savedName"] = saved_name
                items[index - 1]["originalMultipartName"] = original_multipart_name

        metadata = {
            **payload,
            "savedFiles": saved_files,
        }
        (batch_dir / "metadata.json").write_text(
            json.dumps(metadata, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

        self._send_json(
            200,
            {
                "ok": True,
                "projectName": project_name,
                "batchDir": str(batch_dir),
                "fileCount": len(saved_files),
                "files": saved_files,
            },
        )

    def log_message(self, fmt: str, *args: Any) -> None:
        print(f"[{datetime.now().isoformat(timespec='seconds')}] {self.address_string()} {fmt % args}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Receive paper uploads from paper-download-crx.")
    parser.add_argument("--host", default=DEFAULT_HOST)
    parser.add_argument("--port", type=int, default=DEFAULT_PORT)
    parser.add_argument("--upload-dir", default=str(DEFAULT_UPLOAD_DIR))
    args = parser.parse_args()

    upload_dir = Path(args.upload_dir).expanduser().resolve()
    upload_dir.mkdir(parents=True, exist_ok=True)

    server = ThreadingHTTPServer((args.host, args.port), UploadHandler)
    server.upload_dir = upload_dir  # type: ignore[attr-defined]

    print(f"Paper upload server listening on http://{args.host}:{args.port}")
    print(f"Saving uploads to {upload_dir}")
    server.serve_forever()


if __name__ == "__main__":
    main()

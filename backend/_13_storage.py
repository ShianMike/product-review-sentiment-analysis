"""
[Operational Utility] Local Storage and Cleanup

How this module fulfills Project.txt requirements:
- Functional Requirement 7.2: persists completed analyses as backend saved
  projects so users can load or delete prior results from the upload page.
- Non-Functional Requirement 7.3: isolates storage helpers, validates project
  IDs, and supports generated-file cleanup for uploads, exports, and projects.
- Tools and Technologies VIII: implements the local filesystem storage approach
  described for the no-database prototype.

Design note:
- This is intentionally file-based rather than database-backed because
  Project.txt delimits the prototype as a local/classroom system. The validation
  and prefix/suffix cleanup filters protect generated files without deleting
  model comparison artifacts or other static project files.
"""

import json
import os
import re
import time
from datetime import datetime, timezone
from uuid import uuid4


PROJECT_ID_RE = re.compile(r'^[a-zA-Z0-9_.-]+$')


def read_int_env(name, default, minimum=0):
    raw = os.getenv(name, str(default))
    try:
        value = int(raw)
    except (TypeError, ValueError):
        return default
    return value if value >= minimum else default


def slugify_project_title(value, fallback='analysis'):
    slug = re.sub(r'[^a-zA-Z0-9]+', '-', str(value or '').strip().lower()).strip('-')
    return slug[:48] or fallback


def validate_project_id(project_id):
    project_id = str(project_id or '').strip()
    if not project_id or not PROJECT_ID_RE.match(project_id):
        raise ValueError('Invalid project id.')
    return project_id


def project_file_path(projects_folder, project_id):
    safe_id = validate_project_id(project_id)
    return os.path.join(projects_folder, f'{safe_id}.json')


def project_metadata_from_payload(payload):
    return {
        'id': payload.get('id'),
        'title': payload.get('title'),
        'filename': payload.get('filename'),
        'total_reviews': payload.get('total_reviews', 0),
        'created_at': payload.get('created_at'),
        'updated_at': payload.get('updated_at'),
        'positive_pct': payload.get('positive_pct', 0),
        'neutral_pct': payload.get('neutral_pct', 0),
        'negative_pct': payload.get('negative_pct', 0),
    }


def save_analysis_project(projects_folder, result, title=None):
    os.makedirs(projects_folder, exist_ok=True)
    now_dt = datetime.now(timezone.utc)
    now = now_dt.isoformat().replace('+00:00', 'Z')
    filename = str(result.get('filename') or 'analysis')
    project_id = f"{now_dt.strftime('%Y%m%d%H%M%S')}-{slugify_project_title(title or filename)}-{uuid4().hex[:8]}"
    sentiment = result.get('sentiment_distribution') or {}
    result_copy = dict(result)
    result_copy['project_id'] = project_id
    result_copy['project_title'] = title or filename
    result_copy['project_saved_at'] = now
    payload = {
        'id': project_id,
        'title': title or filename,
        'filename': filename,
        'total_reviews': int(result.get('total_reviews') or 0),
        'created_at': now,
        'updated_at': now,
        'positive_pct': (sentiment.get('positive') or {}).get('percentage', 0),
        'neutral_pct': (sentiment.get('neutral') or {}).get('percentage', 0),
        'negative_pct': (sentiment.get('negative') or {}).get('percentage', 0),
        'result': result_copy,
    }
    with open(project_file_path(projects_folder, project_id), 'w', encoding='utf-8') as file_obj:
        json.dump(payload, file_obj, indent=2, default=str)
    return payload


def list_analysis_projects(projects_folder):
    if not os.path.isdir(projects_folder):
        return []
    projects = []
    for filename in os.listdir(projects_folder):
        if not filename.endswith('.json'):
            continue
        path = os.path.join(projects_folder, filename)
        try:
            with open(path, 'r', encoding='utf-8') as file_obj:
                payload = json.load(file_obj)
            projects.append(project_metadata_from_payload(payload))
        except (OSError, json.JSONDecodeError):
            continue
    return sorted(projects, key=lambda item: item.get('created_at') or '', reverse=True)


def load_analysis_project(projects_folder, project_id):
    path = project_file_path(projects_folder, project_id)
    if not os.path.isfile(path):
        return None
    with open(path, 'r', encoding='utf-8') as file_obj:
        return json.load(file_obj)


def delete_analysis_project(projects_folder, project_id):
    path = project_file_path(projects_folder, project_id)
    if not os.path.isfile(path):
        return False
    os.remove(path)
    return True


def cleanup_folder(folder, max_files=100, max_age_hours=168, suffixes=None, prefixes=None):
    if not os.path.isdir(folder):
        return {'deleted': 0, 'remaining': 0}
    now = time.time()
    suffixes = tuple(suffixes) if suffixes else None
    prefixes = tuple(prefixes) if prefixes else None
    files = []
    deleted = 0
    for name in os.listdir(folder):
        path = os.path.join(folder, name)
        if not os.path.isfile(path):
            continue
        if suffixes and not name.lower().endswith(suffixes):
            continue
        if prefixes and not name.startswith(prefixes):
            continue
        try:
            modified = os.path.getmtime(path)
        except OSError:
            continue
        if max_age_hours > 0 and now - modified > max_age_hours * 3600:
            try:
                os.remove(path)
                deleted += 1
                continue
            except OSError:
                pass
        files.append((modified, path))
    files.sort(reverse=True)
    for _, path in files[max_files:]:
        try:
            os.remove(path)
            deleted += 1
        except OSError:
            pass
    remaining = max(0, len(files) - max(0, len(files) - max_files))
    return {'deleted': deleted, 'remaining': remaining}

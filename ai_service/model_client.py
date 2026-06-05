"""
자체 구축 모델 API HTTP 클라이언트.
백엔드가 기대하는 요청/응답 형식으로 원격 API를 호출한다.
"""
from __future__ import annotations

import logging
import os
from typing import Any

import requests

logger = logging.getLogger(__name__)

DEFAULT_MODEL_API_URL = "http://100.92.173.86:8001"
CONNECT_TIMEOUT = 10
READ_TIMEOUT = 120


class ModelAPIError(Exception):
    """원격 모델 API 호출 실패."""


def _base_url() -> str:
    return (os.environ.get("MODEL_API_URL") or DEFAULT_MODEL_API_URL).rstrip("/")


def _post(path: str, payload: dict[str, Any]) -> Any:
    url = f"{_base_url()}{path}"
    try:
        resp = requests.post(
            url,
            json=payload,
            timeout=(CONNECT_TIMEOUT, READ_TIMEOUT),
        )
    except requests.Timeout as exc:
        logger.error("모델 API 타임아웃 — POST %s payload_keys=%s", path, list(payload.keys()))
        raise ModelAPIError(f"모델 API 타임아웃: POST {path}") from exc
    except requests.RequestException as exc:
        logger.error("모델 API 연결 실패 — POST %s err=%s", path, exc)
        raise ModelAPIError(f"모델 API 연결 실패: POST {path}") from exc

    if not resp.ok:
        body = resp.text[:500]
        logger.error("모델 API HTTP %s — POST %s body=%s", resp.status_code, path, body)
        raise ModelAPIError(f"모델 API HTTP {resp.status_code}: POST {path}")

    try:
        return resp.json()
    except ValueError as exc:
        logger.error("모델 API JSON 파싱 실패 — POST %s", path)
        raise ModelAPIError(f"모델 API 응답 JSON 파싱 실패: POST {path}") from exc


def check_health() -> dict[str, Any]:
    url = f"{_base_url()}/health"
    try:
        resp = requests.get(url, timeout=(CONNECT_TIMEOUT, READ_TIMEOUT))
    except requests.Timeout as exc:
        logger.error("모델 API health 타임아웃 — GET %s", url)
        raise ModelAPIError(f"모델 API health 타임아웃: GET {url}") from exc
    except requests.RequestException as exc:
        logger.error("모델 API health 연결 실패 — GET %s err=%s", url, exc)
        raise ModelAPIError(f"모델 API health 연결 실패: GET {url}") from exc

    if not resp.ok:
        logger.error("모델 API health HTTP %s — GET %s", resp.status_code, url)
        raise ModelAPIError(f"모델 API health HTTP {resp.status_code}")

    data = resp.json()
    if data.get("status") != "ok":
        raise ModelAPIError(f"모델 API health 비정상: {data!r}")
    return data


def _normalize_analyze_item(
    item: dict[str, Any],
    *,
    submission_id: int,
    participation_id: int,
    step_id: int,
) -> dict[str, Any]:
    """원격 API 응답 → 백엔드 유사도 분석 형식."""
    return {
        "submission_id": item.get("submission_id", submission_id),
        "participation_id": participation_id,
        "step_id": step_id,
        "sentence_index": item.get("sentence_index", item.get("segment_order", 0)),
        "sentence": item.get("sentence", item.get("content", "")),
        "best_ai_log_id": item.get("best_ai_log_id", item.get("ai_log_id")),
        "similarity_percent": item.get("similarity_percent", item.get("similarity_score", 0.0)),
    }


def analyze(
    content: str,
    ai_logs: list,
    submission_id: int = 0,
    participation_id: int = 0,
    step_id: int = 0,
) -> list:
    """POST /analyze — 유사도 분석 결과 list 반환."""
    if not content or not content.strip():
        return []

    payload = {
        "content": content,
        "ai_logs": [{"id": int(l["id"]), "response": str(l.get("response", ""))} for l in ai_logs],
        "submission_id": int(submission_id),
        "participation_id": int(participation_id),
        "step_id": int(step_id),
    }
    data = _post("/analyze", payload)
    if not isinstance(data, list):
        raise ModelAPIError(f"/analyze 응답이 list가 아님: {type(data)!r}")

    return [
        _normalize_analyze_item(
            item if isinstance(item, dict) else {},
            submission_id=submission_id,
            participation_id=participation_id,
            step_id=step_id,
        )
        for item in data
    ]


def classify_prompt_type(prompt: str) -> dict:
    """POST /analyze-prompt-type — {label, confidence, scores}"""
    data = _post("/analyze-prompt-type", {"prompt": prompt or ""})
    if not isinstance(data, dict):
        raise ModelAPIError(f"/analyze-prompt-type 응답이 dict가 아님: {type(data)!r}")
    return {
        "label": data.get("label"),
        "confidence": data.get("confidence", 0.0),
        "scores": data.get("scores") or {},
    }


def classify_prompt_level(prompt: str) -> dict:
    """POST /analyze-prompt-level — {level, confidence, scores}"""
    data = _post("/analyze-prompt-level", {"prompt": prompt or ""})
    if not isinstance(data, dict):
        raise ModelAPIError(f"/analyze-prompt-level 응답이 dict가 아님: {type(data)!r}")
    level = data.get("level", data.get("label", 1))
    return {
        "level": level,
        "confidence": data.get("confidence", 0.0),
        "scores": data.get("scores") or {},
    }


def score_step(submission: str, criteria: list[str], threshold: int = 3) -> list[dict]:
    """POST /score-step — [{criterion, met, score}, ...]"""
    data = _post(
        "/score-step",
        {
            "submission": submission,
            "criteria": criteria,
            "threshold": threshold,
        },
    )
    if not isinstance(data, list):
        raise ModelAPIError(f"/score-step 응답이 list가 아님: {type(data)!r}")
    return data


def score_rubric(instruction: str, student_text: str) -> dict:
    """POST /score-rubric — {score_regression, score_classification, confidence, class_probs}"""
    data = _post(
        "/score-rubric",
        {"instruction": instruction, "student_text": student_text},
    )
    if not isinstance(data, dict):
        raise ModelAPIError(f"/score-rubric 응답이 dict가 아님: {type(data)!r}")
    return {
        "score_regression": data.get("score_regression"),
        "score_classification": data.get("score_classification"),
        "confidence": data.get("confidence"),
        "class_probs": data.get("class_probs") or {},
    }


def classify_critical_use(prompt: str) -> dict:
    """critical_use_model.classify 와 동일 반환: {label, label_name, confidence, scores}"""
    data = _post("/analyze-critical-use", {"prompt": prompt or ""})
    if not isinstance(data, dict):
        raise ModelAPIError(f"/analyze-critical-use 응답이 dict가 아님: {type(data)!r}")
    return {
        "label": data.get("label"),
        "label_name": data.get("label_name", data.get("label")),
        "confidence": data.get("confidence", 0.0),
        "scores": data.get("scores") or {},
    }


def match_relevance(
    ai_logs: list,
    url_logs: list | None = None,
    *,
    min_score: float = 0.0,
    same_step_only: bool = False,
    max_gap_min: int | None = None,
) -> list:
    """relevance_matcher.match 결과 — ai_log별 related_url_log_id 등 포함 list[dict]"""
    normalized_ai = []
    for log in ai_logs:
        row = dict(log) if isinstance(log, dict) else {}
        if row.get("complete_at") is None and row.get("logged_at") is not None:
            row["complete_at"] = row["logged_at"]
        normalized_ai.append(row)

    payload: dict[str, Any] = {
        "ai_logs": normalized_ai,
        "url_logs": url_logs or [],
        "min_score": min_score,
        "same_step_only": same_step_only,
    }
    if max_gap_min is not None:
        payload["max_gap_min"] = max_gap_min
    data = _post("/match-relevance", payload)
    if not isinstance(data, list):
        raise ModelAPIError(f"/match-relevance 응답이 list가 아님: {type(data)!r}")
    return data

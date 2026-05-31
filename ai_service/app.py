"""
NCP AI 프록시 — 자체 구축 모델 API(MODEL_API_URL)로 HTTP 중계만 수행.
실행: python app.py  (기본 포트 8001)
"""
import logging
import os
import time

from flask import Flask, jsonify, request

from model_client import (
    analyze,
    check_health,
    classify_critical_use,
    classify_prompt_level,
    classify_prompt_type,
    match_relevance,
    score_rubric,
)


def _load_dotenv() -> None:
    env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
    if not os.path.isfile(env_path):
        return
    with open(env_path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, val = line.partition("=")
            key, val = key.strip(), val.strip()
            if key and key not in os.environ:
                os.environ[key] = val


_load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logger = logging.getLogger(__name__)
logger.info(
    "AI 프록시 — 원격 API (%s)",
    os.environ.get("MODEL_API_URL", "http://100.92.173.86:8001"),
)

app = Flask(__name__)


def warmup():
    """서버 시작 시 원격 모델 API 연결 확인."""
    print("[워밍업] 원격 모델 API 확인 중...", flush=True)
    t0 = time.time()
    try:
        check_health()
        print(f"[워밍업] health OK ({time.time() - t0:.1f}s)", flush=True)
        t1 = time.time()
        classify_prompt_type("워밍업")
        classify_prompt_level("워밍업")
        print(f"[워밍업] 프롬프트 API OK ({time.time() - t1:.1f}s)", flush=True)
    except Exception as exc:
        print(f"[워밍업] 원격 API 미연결 — {exc}", flush=True)
        print("[워밍업] 자체 구축 서버 연결 후 요청 시 재시도됩니다.", flush=True)
    print("[워밍업] 루브릭/비판적사용/연관성 — 첫 요청 시 원격 호출", flush=True)
    print("[워밍업] 전체 완료 — 요청 수신 준비됨", flush=True)


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})


@app.route("/analyze", methods=["POST"])
def analyze_route():
    t0 = time.time()
    data = request.get_json(force=True)

    content = data.get("content", "")
    ai_logs = data.get("ai_logs", [])
    submission_id = int(data.get("submission_id", 0))
    participation_id = int(data.get("participation_id", 0))
    step_id = data.get("step_id")
    step_id = int(step_id) if step_id is not None else 0

    print(
        f"[유사도] submission={submission_id} step={step_id} "
        f"ai_logs={len(ai_logs)}개 content={len(content)}자",
        flush=True,
    )

    if not content or not content.strip():
        return jsonify([])

    results = analyze(
        content=content,
        ai_logs=ai_logs,
        submission_id=submission_id,
        participation_id=participation_id,
        step_id=step_id,
    )

    print(f"[유사도] 완료 {time.time() - t0:.1f}s → {len(results)}개 문장", flush=True)
    return jsonify(results)


@app.route("/analyze-prompt-type", methods=["POST"])
def analyze_prompt_type():
    data = request.get_json(force=True)
    prompt = data.get("prompt", "")
    return jsonify(classify_prompt_type(prompt))


@app.route("/analyze-prompt-level", methods=["POST"])
def analyze_prompt_level():
    data = request.get_json(force=True)
    prompt = data.get("prompt", "")
    return jsonify(classify_prompt_level(prompt))


@app.route("/score-rubric", methods=["POST"])
def score_rubric_route():
    t0 = time.time()
    data = request.get_json(force=True)
    instruction = data.get("instruction", "")
    student_text = data.get("student_text", "")

    if not instruction or not instruction.strip() or not student_text or not student_text.strip():
        return jsonify({"error": "instruction과 student_text가 필요합니다."}), 400

    try:
        result = score_rubric(instruction.strip(), student_text.strip())
        print(
            f"[루브릭채점] 완료 {time.time() - t0:.1f}s "
            f"class={result.get('score_classification')} reg={result.get('score_regression')}",
            flush=True,
        )
        return jsonify(result)
    except Exception as e:
        print(f"[루브릭채점] 오류 — {e}", flush=True)
        return jsonify({"error": "루브릭 채점 중 오류가 발생했습니다."}), 500


@app.route("/analyze-critical-use", methods=["POST"])
def analyze_critical_use():
    t0 = time.time()
    data = request.get_json(force=True)
    prompt = data.get("prompt", "")
    preview = (prompt or "")[:200]
    print(f'[비판적사용] 요청 prompt="{preview}"', flush=True)

    result = classify_critical_use(prompt)

    print(
        f'[비판적사용] 완료 {time.time() - t0:.1f}s → '
        f'{result.get("label_name")} conf={result.get("confidence")}',
        flush=True,
    )
    return jsonify(result)


@app.route("/match-relevance", methods=["POST"])
def match_relevance_route():
    t0 = time.time()
    data = request.get_json(force=True)
    ai_logs = data.get("ai_logs", [])
    url_logs = data.get("url_logs", [])
    min_score = float(data.get("min_score", 0.0))
    same_step_only = bool(data.get("same_step_only", False))
    max_gap_min = data.get("max_gap_min")
    if max_gap_min is not None:
        max_gap_min = int(max_gap_min)

    print(f"[연관성매칭] 요청 ai={len(ai_logs)}개 url={len(url_logs)}개", flush=True)

    if not ai_logs:
        print(f"[연관성매칭] 완료 {time.time() - t0:.1f}s → 매칭 0건", flush=True)
        return jsonify([])

    records = match_relevance(
        ai_logs,
        url_logs,
        min_score=min_score,
        same_step_only=same_step_only,
        max_gap_min=max_gap_min,
    )

    matched = sum(1 for row in records if row.get("related_url_log_id") is not None)
    print(f"[연관성매칭] 완료 {time.time() - t0:.1f}s → 매칭 {matched}건", flush=True)
    return jsonify(records)


if __name__ == "__main__":
    warmup()
    app.run(host="0.0.0.0", port=8001, debug=False, threaded=True)

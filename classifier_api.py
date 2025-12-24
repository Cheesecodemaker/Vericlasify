"""
Vericlasify - Document Classification API
Two-stage pipeline: Mistral-7B (label generation) → mDeBERTa (zero-shot classification)
Uses Hugging Face Hosted Inference API
"""

import os
import json
import re
from pathlib import Path
from typing import Optional
from flask import Flask, request, jsonify, Response
from flask_cors import CORS
from werkzeug.utils import secure_filename

# Load environment variables from .env file
from dotenv import load_dotenv
load_dotenv()

# Text extraction
import pdfplumber
from docx import Document

# Hugging Face
from huggingface_hub import InferenceClient
import requests  # For direct API calls

# =============================================================================
# CONFIGURATION
# =============================================================================

HF_TOKEN = os.environ.get("HF_TOKEN", "")

# Models
MISTRAL_MODEL = "mistralai/Mistral-7B-Instruct-v0.2"
MDEBERTA_MODEL = "MoritzLaurer/mDeBERTa-v3-base-xnli-multilingual-nli-2mil7"

# Inference parameters
MAX_NEW_TOKENS = 128
TEMPERATURE = 0.3
MAX_TEXT_LENGTH = 30000

# File handling
ALLOWED_EXTENSIONS = {"pdf", "txt", "docx", "md"}
UPLOAD_FOLDER = Path(__file__).parent / "uploads"
RESULTS_FOLDER = Path(__file__).parent / "results"

# =============================================================================
# FLASK APP SETUP
# =============================================================================

app = Flask(__name__)
CORS(app)
app.config["MAX_CONTENT_LENGTH"] = 16 * 1024 * 1024

UPLOAD_FOLDER.mkdir(exist_ok=True)
RESULTS_FOLDER.mkdir(exist_ok=True)

def allowed_file(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS

def extract_text_from_pdf(file_path):
    text_parts = []
    try:
        with pdfplumber.open(file_path) as pdf:
            for page in pdf.pages:
                page_text = page.extract_text()
                if page_text:
                    text_parts.append(page_text)
    except Exception as e:
        print(f"[WARN] PDF extraction error: {e}")
    return "\n".join(text_parts)

def extract_text_from_docx(file_path):
    try:
        doc = Document(file_path)
        paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
        return "\n".join(paragraphs)
    except Exception as e:
        print(f"[WARN] DOCX extraction error: {e}")
        return ""

def extract_text_from_txt(file_path):
    try:
        with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
            return f.read()
    except Exception as e:
        print(f"[WARN] TXT extraction error: {e}")
        return ""

def extract_text(file_path):
    ext = file_path.suffix.lower()
    if ext == ".pdf":
        text = extract_text_from_pdf(file_path)
    elif ext == ".docx":
        text = extract_text_from_docx(file_path)
    elif ext in [".txt", ".md"]:
        text = extract_text_from_txt(file_path)
    else:
        text = ""
    if len(text) > MAX_TEXT_LENGTH:
        text = text[:MAX_TEXT_LENGTH] + "..."
    return text.strip()

def generate_labels(client, text, retry=True):
    system_prompt = """You are a document classification expert. Analyze document text and generate exactly 3 to 5 high-level category labels.

RULES:
- Labels must be short noun phrases (e.g., "research paper", "invoice", "legal contract")
- Output ONLY a valid JSON array of strings
- No explanations, no markdown, no extra text
- Example output: ["research paper", "scientific study", "academic publication"]"""

    user_prompt = f"""DOCUMENT TEXT:
{text[:MAX_TEXT_LENGTH]}

OUTPUT JSON ARRAY:"""

    try:
        response = client.chat_completion(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            model=MISTRAL_MODEL,
            max_tokens=MAX_NEW_TOKENS,
            temperature=TEMPERATURE
        )
        if hasattr(response, 'choices') and response.choices:
            content = response.choices[0].message.content
        else:
            content = str(response)
        cleaned = content.strip()
        match = re.search(r'\[.*?\]', cleaned, re.DOTALL)
        if match:
            labels = json.loads(match.group())
            if isinstance(labels, list) and all(isinstance(l, str) for l in labels):
                return labels[:5]
        labels = json.loads(cleaned)
        if isinstance(labels, list):
            return [str(l) for l in labels[:5]]
    except Exception as e:
        print(f"[WARN] Label generation error: {e}")
        if retry:
            return generate_labels(client, text, retry=False)
    return ["document", "text file", "general content"]

def classify_with_labels(client, text, labels):
    try:
        classifier_text = text[:3000] if len(text) > 3000 else text
        API_URL = f"https://router.huggingface.co/hf-inference/models/{MDEBERTA_MODEL}"
        headers = {"Authorization": f"Bearer {HF_TOKEN}"}
        payload = {"inputs": classifier_text, "parameters": {"candidate_labels": labels}}
        response = requests.post(API_URL, headers=headers, json=payload, timeout=60)
        if response.status_code != 200:
            return {label: round(1.0 / len(labels), 4) for label in labels}
        result = response.json()
        scores = {}
        if isinstance(result, list):
            for item in result:
                if "label" in item and "score" in item:
                    scores[item["label"]] = round(float(item["score"]), 4)
        elif isinstance(result, dict) and "labels" in result and "scores" in result:
            for label, score in zip(result["labels"], result["scores"]):
                scores[label] = round(float(score), 4)
        return scores if scores else {label: round(1.0 / len(labels), 4) for label in labels}
    except Exception as e:
        print(f"[ERROR] Classification error: {e}")
        return {label: round(1.0 / len(labels), 4) for label in labels}

@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "service": "vericlasify-ai"})

@app.route("/api/classify", methods=["POST"])
def api_classify():
    if "file" not in request.files:
        return jsonify({"error": "No file provided"}), 400
    file = request.files["file"]
    if file.filename == "":
        return jsonify({"error": "No file selected"}), 400
    if not allowed_file(file.filename):
        return jsonify({"error": f"Invalid file type"}), 400
    filename = secure_filename(file.filename)
    file_path = UPLOAD_FOLDER / filename
    file.save(file_path)
    try:
        client = InferenceClient(token=HF_TOKEN)
        text = extract_text(file_path)
        if not text:
            return jsonify({"error": "Could not extract text"})
        labels = generate_labels(client, text)
        scores = classify_with_labels(client, text, labels)
        best_label = max(scores, key=scores.get) if scores else labels[0]
        return jsonify({"label": best_label, "confidence": scores.get(best_label, 0), "all_scores": scores})
    finally:
        if file_path.exists():
            file_path.unlink()

@app.route("/api/classify/stream", methods=["POST"])
def api_classify_stream():
    if "file" not in request.files:
        return jsonify({"error": "No file provided"}), 400
    file = request.files["file"]
    filename = secure_filename(file.filename)
    file_path = UPLOAD_FOLDER / filename
    file.save(file_path)
    
    def generate():
        client = InferenceClient(token=HF_TOKEN)
        try:
            yield f"data: {json.dumps({'stage': 'extract', 'status': 'running'})}\n\n"
            text = extract_text(file_path)
            if not text:
                yield f"data: {json.dumps({'stage': 'extract', 'status': 'error', 'error': 'No text extracted'})}\n\n"
                return
            text_preview = text[:8000] + ('...' if len(text) > 8000 else '')
            yield f"data: {json.dumps({'stage': 'extract', 'status': 'complete', 'text_length': len(text), 'extracted_text': text_preview})}\n\n"
            yield f"data: {json.dumps({'stage': 'labels', 'status': 'running'})}\n\n"
            labels = generate_labels(client, text)
            yield f"data: {json.dumps({'stage': 'labels', 'status': 'complete', 'labels': labels})}\n\n"
            yield f"data: {json.dumps({'stage': 'classify', 'status': 'running'})}\n\n"
            scores = classify_with_labels(client, text, labels)
            best_label = max(scores, key=scores.get) if scores else labels[0]
            best_confidence = scores.get(best_label, 0.0)
            result = {"stage": "complete", "file_name": file_path.name, "label": best_label, "confidence": best_confidence, "all_scores": scores}
            yield f"data: {json.dumps(result)}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'stage': 'error', 'error': str(e)})}\n\n"
        finally:
            if file_path.exists():
                file_path.unlink()
    return Response(generate(), mimetype="text/event-stream")

@app.route("/", methods=["GET"])
def index():
    return '<meta http-equiv="refresh" content="0; url=/ui/index.html">'

@app.route("/api/token/status", methods=["GET"])
def token_status():
    global HF_TOKEN
    if HF_TOKEN:
        masked = HF_TOKEN[:4] + "..." + HF_TOKEN[-4:] if len(HF_TOKEN) > 8 else "****"
        return jsonify({"configured": True, "masked": masked})
    return jsonify({"configured": False, "masked": None})

@app.route("/api/token/update", methods=["POST"])
def update_token():
    global HF_TOKEN
    data = request.get_json()
    if not data or "token" not in data:
        return jsonify({"error": "No token provided"}), 400
    new_token = data["token"].strip()
    if not new_token.startswith("hf_"):
        return jsonify({"error": "Invalid token format"}), 400
    HF_TOKEN = new_token
    env_path = Path(__file__).parent / ".env"
    try:
        if env_path.exists():
            with open(env_path, "r") as f:
                lines = f.readlines()
            found = False
            for i, line in enumerate(lines):
                if line.startswith("HF_TOKEN="):
                    lines[i] = f"HF_TOKEN={new_token}\n"
                    found = True
                    break
            if not found:
                lines.append(f"HF_TOKEN={new_token}\n")
            with open(env_path, "w") as f:
                f.writelines(lines)
        else:
            with open(env_path, "w") as f:
                f.write(f"HF_TOKEN={new_token}\n")
        return jsonify({"success": True, "message": "Token updated"})
    except Exception as e:
        return jsonify({"success": True, "message": f"Token updated (save failed: {e})"})

@app.route("/ui/<path:filename>")
def serve_ui(filename):
    from flask import send_from_directory
    ui_folder = Path(__file__).parent / "ui"
    return send_from_directory(ui_folder, filename)

if __name__ == "__main__":
    print("=" * 60)
    print("Vericlasify AI Classification API")
    print("=" * 60)
    print(f"HF Token: {'Configured' if HF_TOKEN else 'NOT CONFIGURED'}")
    print(f"Models: {MISTRAL_MODEL} + {MDEBERTA_MODEL}")
    print(f"Max text length: {MAX_TEXT_LENGTH} chars")
    print("=" * 60)
    print("Starting server on http://localhost:5050")
    print("Dashboard: http://localhost:5050/ui/index.html")
    print("=" * 60)
    # IMPORTANT: use_reloader=False to prevent file deletion on stop
    app.run(host="0.0.0.0", port=5050, debug=True, use_reloader=False)

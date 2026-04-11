"""
Multilingual cross-encoder reranker.

Model: unicamp-dl/mMiniLM-L6-v2-mmarco-v2
  - 6-layer mMiniLM (Distilled)
  - Multilingual: trained on mMARCO (MS MARCO translated to 13 languages)
  - Ideal for mixed English/French job contexts common in the SwipeTurn market.
  - Output: raw logit (higher = more relevant)

Pre-warming:
  Call reranker.warmup() at server startup to download and cache weights before
  the first live request hits.
"""
import logging
import time
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeout
from typing import Optional

logger = logging.getLogger(__name__)

# Production model: multilingual L6 reranker for mixed English/French job text
RERANKER_MODEL = "unicamp-dl/mMiniLM-L6-v2-mmarco-v2"

# Reduce top-K to keep latency <2s on CPU at inference time
RERANK_TOP_K = 15

_reranker = None
_executor = ThreadPoolExecutor(max_workers=1)
_warmed_up = False


def get_reranker_model():
    """Lazily load and cache the cross-encoder model."""
    global _reranker, _warmed_up
    if _reranker is None:
        from sentence_transformers import CrossEncoder
        logger.info("Loading cross-encoder reranker '%s'...", RERANKER_MODEL)
        t0 = time.time()
        _reranker = CrossEncoder(RERANKER_MODEL)
        elapsed = time.time() - t0
        logger.info("Reranker model loaded in %.1fs.", elapsed)
        _warmed_up = True
    return _reranker


def warmup():
    """
    Pre-download and cache the reranker model.
    Call this at server startup to avoid cold-start latency on the first live feed request.
    """
    global _warmed_up
    if _warmed_up:
        return
    logger.info("[reranker] Warming up model '%s'...", RERANKER_MODEL)
    t0 = time.time()
    try:
        model = get_reranker_model()
        # Single dummy inference to fully JIT-compile any lazy paths
        model.predict([("warmup query", "warmup passage")])
        elapsed = time.time() - t0
        logger.info("[reranker] Warmup complete in %.1fs.", elapsed)
        _warmed_up = True
    except Exception as exc:
        logger.warning("[reranker] Warmup failed: %s", exc)


def _predict_sync(pairs: list[tuple[str, str]]) -> tuple[list[float], float]:
    """Run inference and return (scores, latency_ms)."""
    t0 = time.time()
    model = get_reranker_model()
    scores = model.predict(pairs)
    latency_ms = (time.time() - t0) * 1000
    return [float(s) for s in scores], latency_ms


def rerank_pairs(
    pairs: list[tuple[str, str]],
    timeout_seconds: float = 4.0,
) -> Optional[tuple[list[float], float]]:
    """
    Cross-encode a list of (query, passage) pairs and return (scores, latency_ms).
    Returns None on timeout or failure so callers can safely skip reranking.
    """
    if not pairs:
        return [], 0.0
    try:
        future = _executor.submit(_predict_sync, pairs)
        return future.result(timeout=timeout_seconds)
    except FuturesTimeout:
        logger.warning(
            "[reranker] Cross-encoder timed out after %.1fs for %d pairs.",
            timeout_seconds, len(pairs)
        )
        return None
    except Exception as exc:
        logger.warning("[reranker] Cross-encoder failed: %s", exc)
        return None

import logging
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeout

logger = logging.getLogger(__name__)

_reranker = None
_executor = ThreadPoolExecutor(max_workers=1)


def get_reranker_model():
    global _reranker
    if _reranker is None:
        from sentence_transformers import CrossEncoder
        logger.info("Loading cross-encoder reranker 'ms-marco-MiniLM-L-6-v2'...")
        _reranker = CrossEncoder("cross-encoder/ms-marco-MiniLM-L-6-v2")
        logger.info("Reranker model loaded.")
    return _reranker


def _predict_sync(pairs: list[tuple[str, str]]) -> list[float]:
    model = get_reranker_model()
    scores = model.predict(pairs)
    return [float(s) for s in scores]


def rerank_pairs(pairs: list[tuple[str, str]], timeout_seconds: float = 1.0) -> list[float] | None:
    """
    Returns raw cross-encoder scores for each input pair.
    Returns None on timeout/failure so callers can safely fallback.
    """
    if not pairs:
        return []
    try:
        future = _executor.submit(_predict_sync, pairs)
        return future.result(timeout=timeout_seconds)
    except FuturesTimeout:
        logger.warning("Cross-encoder rerank timed out after %.2fs.", timeout_seconds)
        return None
    except Exception as exc:
        logger.warning("Cross-encoder rerank failed: %s", exc)
        return None

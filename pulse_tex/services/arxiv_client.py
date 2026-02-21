import httpx

from pulse_tex.core.config import Config


class ArxivPulseClient:
    def __init__(self):
        self.base_url = Config.ARXIV_PULSE_URL.rstrip("/")
        self._client: httpx.AsyncClient | None = None

    @property
    def client(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(timeout=30.0)
        return self._client

    async def close(self):
        if self._client:
            await self._client.aclose()
            self._client = None

    async def search_papers(self, query: str, page: int = 1, page_size: int = 20) -> dict:
        response = await self.client.get(
            f"{self.base_url}/api/papers/search",
            params={"q": query, "page": page, "page_size": page_size},
        )
        response.raise_for_status()
        return response.json()

    async def get_paper(self, paper_id: int) -> dict:
        response = await self.client.get(f"{self.base_url}/api/papers/{paper_id}")
        response.raise_for_status()
        return response.json()

    async def get_paper_by_arxiv_id(self, arxiv_id: str) -> dict:
        response = await self.client.get(f"{self.base_url}/api/papers/arxiv/{arxiv_id}")
        response.raise_for_status()
        return response.json()

    async def get_recent_papers(self, days: int = 7, limit: int = 50) -> dict:
        response = await self.client.get(
            f"{self.base_url}/api/papers/recent",
            params={"days": days, "limit": limit},
        )
        response.raise_for_status()
        return response.json()

    async def get_recent_cache(self) -> dict:
        response = await self.client.get(f"{self.base_url}/api/papers/recent/cache")
        response.raise_for_status()
        return response.json()

    async def health_check(self) -> bool:
        try:
            response = await self.client.get(f"{self.base_url}/api/health", timeout=5.0)
            return response.status_code == 200
        except Exception:
            return False


arxiv_client = ArxivPulseClient()

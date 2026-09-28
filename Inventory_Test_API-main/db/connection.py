from motor.motor_asyncio import AsyncIOMotorClient
from config import settings


class MongoDB:
    test_client = None
    live_client = None

    @classmethod
    def connect(cls):
        cls.test_client = AsyncIOMotorClient(settings.TEST_URI, maxPoolSize=50)
        cls.live_client = AsyncIOMotorClient(settings.LIVE_URI, maxPoolSize=50)

    @classmethod
    def close(cls):
        for client in (
            cls.test_client,
            cls.live_client,
        ):
            if client is not None:
                client.close()

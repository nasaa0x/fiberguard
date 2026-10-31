import pytest
from backend.fiberguard.api import create_app
from backend.fiberguard.repository import Repository, BASELINE
from backend.fiberguard.engine import graph_from_dataset


@pytest.fixture
def dataset(tmp_path):
    return Repository(tmp_path / "network.json", baseline_path=BASELINE).snapshot()


@pytest.fixture
def graph(dataset):
    return graph_from_dataset(dataset)


@pytest.fixture
def client(tmp_path):
    return create_app(
        {
            "TESTING": True,
            "DATA_PATH": tmp_path / "network.json",
            "BASELINE_PATH": BASELINE,
            "ROAD_CACHE_PATH": tmp_path / "road-cache",
        }
    ).test_client()

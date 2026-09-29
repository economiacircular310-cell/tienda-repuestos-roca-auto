import os

os.environ.setdefault("LENIN_SECRET", "clave-de-pruebas")

import pytest

from lenin_auto.store import Store, get_store


@pytest.fixture(scope="session")
def store() -> Store:
    return get_store()

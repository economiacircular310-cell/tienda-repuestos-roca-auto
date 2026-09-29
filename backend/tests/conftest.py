import os
import tempfile

os.environ.setdefault("LENIN_SECRET", "clave-de-pruebas")
os.environ.setdefault("LENIN_DB", os.path.join(tempfile.mkdtemp(prefix="lenin-"), "pruebas.sqlite3"))

import pytest

from lenin_auto.store import Store, get_store


@pytest.fixture(scope="session")
def store() -> Store:
    return get_store()

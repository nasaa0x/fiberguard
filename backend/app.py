"""Run from repository root: python -m backend.app"""

import os
from .fiberguard.api import create_app

app = create_app()
if __name__ == "__main__":
    app.run(
        host=os.environ.get("HOST", "127.0.0.1"),
        port=int(os.environ.get("PORT", "5001")),
        debug=os.environ.get("FLASK_DEBUG") == "1",
    )

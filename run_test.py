import json
import base64
import sys

with open("backend/services/replay_engine.py", "r") as f:
    text = f.read()
print("Contains entry_price inside _close_position:", '"entry_price"' in text)

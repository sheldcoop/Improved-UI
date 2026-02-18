
from flask import Blueprint, request, jsonify
import logging
import json
import os
import uuid

strategy_bp = Blueprint('strategies', __name__)
logger = logging.getLogger(__name__)

DATA_FILE = 'data/strategies.json'

def load_strategies():
    if not os.path.exists(DATA_FILE):
        return []
    try:
        with open(DATA_FILE, 'r') as f:
            return json.load(f)
    except:
        return []

def save_strategies(strategies):
    with open(DATA_FILE, 'w') as f:
        json.dump(strategies, f, indent=2)

@strategy_bp.route('', methods=['GET'])
def get_strategies():
    strategies = load_strategies()
    return jsonify(strategies)

@strategy_bp.route('', methods=['POST'])
def create_strategy():
    data = request.json
    strategies = load_strategies()
    
    # Update if exists, else create
    if 'id' in data and data['id'] != 'new':
        existing_idx = next((index for (index, d) in enumerate(strategies) if d["id"] == data["id"]), None)
        if existing_idx is not None:
            strategies[existing_idx] = data
            save_strategies(strategies)
            logger.info(f"Updated strategy: {data['name']}")
            return jsonify(data)
    
    # New Strategy
    new_strategy = data.copy()
    if new_strategy.get('id') == 'new':
        new_strategy['id'] = str(uuid.uuid4())
    
    strategies.append(new_strategy)
    save_strategies(strategies)
    logger.info(f"Created strategy: {new_strategy['name']}")
    
    return jsonify(new_strategy), 201

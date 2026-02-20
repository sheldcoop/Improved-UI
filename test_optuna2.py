import optuna
import random

def objective(trial):
    x = trial.suggest_int('x', -10, 10)
    y = trial.suggest_int('y', -10, 10)
    # fake score
    score = float(x + y + random.uniform(0, 5))
    trial.set_user_attr('score', score)
    return score

study = optuna.create_study(direction="maximize")
study.optimize(objective, n_trials=30)

grid_results = []
for trial in study.trials:
    if trial.value is None: continue
    grid_results.append({
        "paramSet": trial.params,
        "score": trial.value
    })

grid_results.sort(key=lambda x: x["score"], reverse=True)

print("study.best_params =", study.best_params)
print("grid_results[0]   =", grid_results[0]["paramSet"])
print("Match?            =", study.best_params == grid_results[0]["paramSet"])

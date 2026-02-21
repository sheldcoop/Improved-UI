# Auto-tune example script deprecated. Auto-tune has been removed from the application.
# This file remains for reference but does not perform any requests.


print("Running Auto-Tune with reproducible=True (Run 1)...")
res1 = requests.post(url, json=payload, headers=headers)
print("Run 1 complete.")

print("Running Auto-Tune with reproducible=True (Run 2)...")
res2 = requests.post(url, json=payload, headers=headers)
print("Run 2 complete.")

if res1.status_code == 200 and res2.status_code == 200:
    data1 = res1.json()
    data2 = res2.json()
    best1 = data1.get('bestParams')
    best2 = data2.get('bestParams')
    
    match = best1 == best2
    print(f"Results Match? {match}")
    if not match:
        print("Run 1 Best Params:", best1)
        print("Run 2 Best Params:", best2)
else:
    print("API Error:", res1.text, res2.text)


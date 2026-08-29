
import os, time
src = r"D:/软件开发/环监智库/frontend/src/views/Home.vue"
tmp = src + ".new"
for i in range(60):
    try:
        os.replace(tmp, src)
        print(f"REPLACED after {i} tries")
        break
    except PermissionError:
        time.sleep(2)
else:
    print("LOCK_NOT_RELEASED")

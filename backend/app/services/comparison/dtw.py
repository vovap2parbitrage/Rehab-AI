import numpy as np

def dtw_path(patient: np.ndarray, reference: np.ndarray) -> list[tuple[int, int]]:
    """Align two sequences of shape(frames, joints)"""

    n, m = len(patient), len(reference)
    cost = np.linalg.norm(patient[:, None, :] - reference[None, :, :], axis=2)

    acc = np.full((n, m), np.inf)
    acc[0, 0] = cost[0, 0]
    for i in range(n):
        for j in range(m):
            if i == 0 and j == 0:
                continue
            best_prev = min(
                acc[i - 1, j] if i > 0 else np.inf,
                acc[i, j - 1] if j > 0 else np.inf,
                acc[i - 1, j - 1] if i > 0 and j > 0 else np.inf,
            )
            acc[i, j] = cost[i, j] + best_prev

    # walk back from the end
    i, j = n - 1, m - 1
    path = [(i, j)]
    while i > 0 or j > 0:
        options = []
        if i > 0 and j > 0:
            options.append((acc[i - 1, j - 1], i - 1, j - 1))
        if i > 0:
            options.append((acc[i - 1, j], i - 1, j))
        if j > 0:
            options.append((acc[i, j - 1], i, j - 1))
        _, i, j = min(options)
        path.append((i, j))
    return path[::-1]
"""Generate the illustrative all-spiral disk profile, independent of catalog fits."""
import json
from pathlib import Path
import numpy as np
from scipy.optimize import nnls

r = np.geomspace(.005, 8, 500)
sigma = np.geomspace(.008, 3, 20)
light = np.exp(-1.67834699 * r)
matrix = np.exp(-.5 * (r[:, None] / sigma) ** 2)
weight = 1 / np.maximum(light, .003)
peaks, _ = nnls(matrix * weight[:, None], light * weight)
profile = {
    'description': 'Illustrative exponential disk, half-light radius 1; not an observed profile.',
    'gaussians': [dict(sigmaRe=float(s), peak=float(p)) for s, p in zip(sigma, peaks)],
}
out = Path(__file__).resolve().parents[1] / 'src/data/spiral-profile.json'
out.write_text(json.dumps(profile, indent=2) + '\n')
print('Generated the shared illustrative spiral profile.')

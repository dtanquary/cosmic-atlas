"""Reproduce the Planck18 lookback-time reference. The browser only interpolates this table."""
import json
from pathlib import Path
import numpy as np
from astropy import units as u
from astropy.cosmology import Planck18, z_at_value

RING_GYR = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, *range(1, 14), 13.5]
rings = []
for gyr in RING_GYR:
    z = float(z_at_value(Planck18.lookback_time, gyr * u.Gyr))
    rings.append({"lookbackGyr": gyr, "redshift": z, "comovingMpc": float(Planck18.comoving_distance(z).value)})

# Log spacing resolves the nearby volume while reaching last scattering.
redshift = np.logspace(-4, np.log10(1100), 256)
comoving = Planck18.comoving_distance(redshift).value
lookback = Planck18.lookback_time(redshift).value

# Measure the browser's actual path: exact comoving distance -> interpolated lookback.
# Geometric midpoints of the log-spaced rows make the maximum deterministic; random samples add coverage.
rng = np.random.default_rng(20260912)
check_z = np.concatenate(([1e-4, 1100], [ring["redshift"] for ring in rings], np.sqrt(redshift[:-1] * redshift[1:]), 10 ** rng.uniform(-4, np.log10(1100), 512)))
exact = Planck18.lookback_time(check_z).value
approximate = np.interp(Planck18.comoving_distance(check_z).value, comoving, lookback)
max_error = float(np.max(np.abs(exact - approximate)))
assert max_error < 0.01, f"Lookback interpolation error {max_error} Gyr"

reference = {
    "version": 1,
    "cosmology": "Planck18",
    "rings": rings,
    "table": {"redshift": redshift.tolist(), "comovingMpc": comoving.tolist(), "lookbackGyr": lookback.tolist()},
    "maxInterpolationErrorGyr": max_error,
    "sources": {
        "parameters": "https://doi.org/10.1051/0004-6361/201833910",
        "calculation": "https://docs.astropy.org/en/stable/api/astropy.cosmology.realizations.Planck18.html",
        "explanation": "https://www.esa.int/Science_Exploration/Space_Science/Planck/Planck_and_the_cosmic_microwave_background",
    },
    "disclosure": "Lookback time is model-dependent: these values use Planck18, the same cosmology as the DESI positions. A ring marks the present-day comoving distance from which light seen now left at that lookback time; comoving distance is not the distance the light traveled. Nearby-layer distances are direct measurements, so their light travel time is distance divided by c.",
}
path = Path(__file__).resolve().parents[1] / "src/data/lookback.json"
path.write_text(json.dumps(reference, indent=2) + "\n")
print(f"Wrote {path.name}: {len(rings)} rings, {len(redshift)} rows, max interpolation error {max_error:.2e} Gyr")

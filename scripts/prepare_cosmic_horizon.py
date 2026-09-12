"""Reproduce the observer-centered CMB reference radius, independently of DESI."""
import json
from pathlib import Path
from astropy.cosmology import Planck18

# Rounded redshift: recombination did not happen at one infinitely thin distance.
redshift = 1090
reference = {
    "version": 1,
    "cosmology": "Planck18",
    "lastScatteringRedshift": redshift,
    "radiusMpc": float(Planck18.comoving_distance(redshift).value),
    "lookbackGyr": float(Planck18.lookback_time(redshift).value),
    "ageAtEmissionYears": float(Planck18.age(redshift).value * 1e9),
    "sources": {
        "parameters": "https://doi.org/10.1051/0004-6361/201833910",
        "calculation": "https://docs.astropy.org/en/stable/api/astropy.cosmology.realizations.Planck18.html",
        "explanation": "https://www.esa.int/Science_Exploration/Space_Science/Planck/Planck_and_the_cosmic_microwave_background",
    },
    "disclosure": "Approximate last-scattering surface centered on the Sun / Observer. Radius is a present-day comoving distance inferred with Planck18 at rounded z=1090, not the light travel time or a physical edge of the universe. The thin shell and its colors/grid are illustrative; no measured CMB temperature map is displayed.",
}
path = Path(__file__).resolve().parents[1] / "src/data/cosmic-horizon.json"
path.write_text(json.dumps(reference, indent=2) + "\n")
print(f"Wrote {path.name}: {reference['radiusMpc']:.3f} Mpc")

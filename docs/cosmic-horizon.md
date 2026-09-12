# Cosmic microwave background reference

The optional CMB shell represents the approximate last-scattering surface seen by the observer at the coordinate origin. It is an observer-centered reference, excluded from galaxy identities, counts, picking and pair measurements. It does not follow the exploration camera.

`uv run python scripts/prepare_cosmic_horizon.py` generates the compact source sidecar. Astropy's Planck18 cosmology, also used for the DESI positions, gives **13,884.421 Mpc (45.3 billion light-years)** at rounded last-scattering redshift **z = 1090**. This is a present-day comoving radius. The corresponding lookback time is 13.787 billion years and the modeled age at emission is about 372,000 years. These rounded model-dependent values do not assert an infinitely thin measured boundary.

Sources: [Planck 2018 cosmological parameters](https://doi.org/10.1051/0004-6361/201833910), [Astropy Planck18](https://docs.astropy.org/en/stable/api/astropy.cosmology.realizations.Planck18.html), [ESA's CMB explanation](https://www.esa.int/Science_Exploration/Space_Science/Planck/Planck_and_the_cosmic_microwave_background).

The CMB is early light released when the universe became transparent. Its last-scattering surface is not a physical wall or the particle horizon, and does not mark the extent of the entire universe. The visualization uses a thin illustrative shell, restrained colors and reference grid; it does not display measured temperature anisotropies.

Compare the active manifest's maximum comoving distance with this radius. The full catalog reaches 4,830.889 Mpc, about **35% of the shell radius**. This is radial reach, not the percentage of the universe, surveyed volume, or known galaxies mapped. Angular coverage, selection effects and variable completeness matter; the displayed DESI sample is not all human galaxy mapping. No unobserved region is labeled empty.

Implementation and actual-GPU verification are pending at this reference-data checkpoint.

# Public domain: NASA's 3D models

**What this record covers:** the 3D models NASA itself publishes in [NASA 3D Resources](https://science.nasa.gov/3d-resources/) and its [GitHub repository](https://github.com/nasa/NASA-3D-Resources), when Backstage ships them as `licence: "public-domain"` with `publicDomain: "docs/legal/public-domain/nasa.md"` (spec 17, section 1; licence audit, section 2, rule 1).

**Decided:** by the owner, 18 Nov 2026, adding "public domain (US government work)" to the shipped licences. Checked by S4 the same day.

None of this is legal advice. If StoryStage is ever sold or promoted using these models, the owner gets advice first.

## Why they're public domain

- **NASA's guidelines** ([Images and media](https://www.nasa.gov/nasa-brand-center/images-and-media/), read 18 Nov 2026) say NASA's material "generally [is] not subject to copyright in the United States".
- **The GitHub repository's README** says "These assets are free and without copyright", and points to those guidelines.
- **Outside the United States**, NASA doesn't say what it claims, if anything. The README's "free and without copyright" is the basis we rely on.

## The conditions we keep

1. **Credit NASA as the source.** NASA's guidelines say it "should be acknowledged as the source of the material". The credit line is "<Model> by NASA (public domain)", or "<Model> by NASA/<modeller> (public domain)" where the page names one, for example "Saturn V by NASA/Michael D. Carbajal (public domain)".
2. **No endorsement.** StoryStage never says or suggests that NASA endorses it. NASA's models are never used in StoryStage's own promotion, its store pages or its marketing.
3. **No NASA insignia.** NASA's guidelines say the insignia, logotype and identifiers are protected by law and "are not in the public domain". Before a model ships, its textures are checked for the "meatball" insignia, the "worm" logotype and the seal. Any that has one gets that part of the texture painted out in the build, or isn't shipped.
4. **Only NASA's own models.** A page that names a contractor or another maker as the source (for example "DigitalSpace Corporation" for Hubble (A)) isn't covered, unless that maker's own licence allows it. Any such model goes through the audit's ordinary rows.
5. **One item at a time.** Each model's own page is read as it is added, and its `source.url` is that page, with the date it was retrieved (rule 3).

## Models shipped under this record

From 21 Nov 2026 (the owner's choices: models that stand on the ground, not satellites, stations or telescopes), 16 models, each credited as its page says: the Apollo lunar module, the crawler-transporter, the Jupiter-C rocket, the Saturn V, the Space Shuttle (D), the Vehicle Assembly Building, the Extravehicular Mobility Unit and the Gemini, Mark III, Mercury and Z2 spacesuits, a helmet, Robonaut 2, the Viking lander, Ingenuity and Perseverance. The meatball is painted out of six of them in the build (`cover`; the Mark III's chest badge, the Shuttle's wing and sides, the Vehicle Assembly Building, the Z2's patch, and Ingenuity's and Perseverance's blades), with JPL's logo, and the owner saw each before and after. The Astronaut is left out: its page credits DigitalSpace Corporation (condition 4). Perseverance's page credits "NASA/Jet Propulsion Laboratory": JPL is NASA's laboratory, run by Caltech, and the owner decided on 21 Nov 2026 that condition 4 covers it, as NASA credits its JPL work as NASA's.

The source list in `storystage/backstage-assets` (`sources/nasa.json`) is the list, and the licence audit's section 4 is generated from it.

import json
import urllib.request
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd
import shapely
import topojson

# Run after build_data.py: python build_map_layers.py
# Needs geopandas and topojson (pip install topojson). Writes data/geo.js.

site_directory = Path(__file__).resolve().parent
download_directory = site_directory / "source" / "downloads"
work_directory = site_directory / "work"

downloads = {
    "states-10m.json": "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json",
    "countries-50m.json": "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json",
    "ne_50m_lakes.geojson": "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_lakes.geojson",
}
for file_name, url in downloads.items():
    if not (download_directory / file_name).exists():
        urllib.request.urlretrieve(url, download_directory / file_name)

equal_area = 5070
square_meters_per_acre = 4046.8564224

# Lower 48 states ####

outside_lower_48 = [
    "Alaska",
    "Hawaii",
    "Puerto Rico",
    "Guam",
    "American Samoa",
    "United States Virgin Islands",
    "Commonwealth of the Northern Mariana Islands",
]
states = gpd.read_file(download_directory / "states-10m.json", layer="states").set_crs(4326, allow_override=True)
states = states[~states["name"].isin(outside_lower_48)].to_crs(equal_area)
states["geometry"] = states.geometry.buffer(0)

# Royce cessions and land outside them (from build_data.py) ####

cessions = gpd.read_file(work_directory / "cessions.geojson").to_crs(equal_area)
cessions["geometry"] = cessions.geometry.make_valid()
outside = gpd.read_file(work_directory / "outside.geojson").to_crs(equal_area)
outside["geometry"] = outside.geometry.make_valid()

zone_of = {
    "Original states: colonial and state acquisition": "original",
    "Kentucky, Tennessee, West Virginia: crown and state cessions": "kentucky",
    "Gulf coast: acquired from France and Spain": "gulf",
    "Texas: Republic and state removal": "texas",
    "California: no ratified treaty": "california",
}
south_dakota = states[states["name"] == "South Dakota"].geometry.iloc[0]
zone_rows = []
for area in outside.itertuples():
    if area.g.startswith("Dakota"):
        zone_rows.append({"z": "james", "y": 1880, "geometry": area.geometry.intersection(south_dakota)})
        zone_rows.append({"z": "dakota", "y": 1904, "geometry": area.geometry.difference(south_dakota)})
    else:
        zone_rows.append({"z": zone_of[area.g], "y": area.y, "geometry": area.geometry})
outside = gpd.GeoDataFrame(zone_rows, crs=equal_area)
outside = outside[~outside.geometry.is_empty].reset_index(drop=True)

# Seams between Royce's map sheets ####
# Many seams run along rivers. Each is cut into 20 km pieces, and each piece
# joins whichever touching area was ceded last, so no river-shaped strip
# shows up on the map years before the land beside it.

lower_48_land = shapely.union_all(states.geometry.values)
covered = shapely.union_all(list(cessions.geometry.values) + list(outside.geometry.values))
seams = gpd.GeoDataFrame(geometry=[lower_48_land.difference(covered)], crs=equal_area)
seams = seams.explode(index_parts=False).reset_index(drop=True)
seams = seams[seams.geometry.area > 2e6]

west, south, east, north = seams.total_bounds
grid_cells = [
    shapely.box(x, y, x + 20000, y + 20000)
    for x in np.arange(west, east, 20000)
    for y in np.arange(south, north, 20000)
]
grid = gpd.GeoDataFrame(geometry=grid_cells, crs=equal_area)
seams = gpd.overlay(seams, grid, how="intersection").explode(index_parts=False).reset_index(drop=True)

neighbours = gpd.GeoDataFrame(
    pd.concat(
        [
            cessions[["geometry", "y"]].assign(layer="cessions", key=cessions["n"].values),
            outside[["geometry", "y"]].assign(layer="outside", key=range(len(outside))),
        ],
        ignore_index=True,
    ),
    crs=equal_area,
)
neighbours["y"] = neighbours["y"].fillna(0)
touching = gpd.sjoin_nearest(seams, neighbours, how="left", max_distance=100)
touching = touching[touching["layer"].notna()].sort_values("y").groupby(level=0).last()
remote = seams.loc[~seams.index.isin(touching.index)]
if len(remote):
    touching = pd.concat([touching, gpd.sjoin_nearest(remote, neighbours, how="left").groupby(level=0).first()])
for (layer, key), group in touching.groupby(["layer", "key"]):
    seam = shapely.union_all(seams.loc[group.index].geometry.values).buffer(30)
    if layer == "cessions":
        row = cessions.index[cessions["n"] == key][0]
        cessions.at[row, "geometry"] = cessions.at[row, "geometry"].union(seam)
    else:
        outside.at[key, "geometry"] = outside.at[key, "geometry"].union(seam)

outside = outside.dissolve(by=["z", "y"], as_index=False)
outside["a"] = (outside.geometry.area / square_meters_per_acre).round().astype("int64")

# Natural lakes ####

reservoirs = "Reservoir|Réservoir|Mead|Powell|Sakakawea|Oahe|Francis Case|Peck|Falcon|Kentucky Lake|Thurmond|Wheeler|Salton"
lakes = gpd.read_file(download_directory / "ne_50m_lakes.geojson").cx[-126:-66, 24:50.5]
lakes = lakes[lakes.to_crs(equal_area).geometry.area > 4e8]
lakes = lakes[~lakes["name"].fillna("").str.contains(reservoirs)][["name", "geometry"]]

# Canada, Mexico and the islands in view ####

countries = gpd.read_file(download_directory / "countries-50m.json", layer="countries").set_crs(
    4326, allow_override=True
)
countries = countries[countries["name"].isin(["Canada", "Mexico", "Cuba", "Bahamas"])]
countries = gpd.clip(countries, (-140, 14, -52, 60))[["name", "geometry"]]

# Present-day reservations ####

reservations = gpd.read_file(work_directory / "reservations.geojson")[["NAME", "geometry"]]

# Topologies ####

ceded_topology = topojson.Topology(
    [
        cessions[["n", "y", "geometry"]].to_crs(4326),
        outside[["z", "y", "a", "geometry"]].to_crs(4326),
        lakes,
    ],
    object_name=[
        "cessions",
        "outside",
        "lakes",
    ],
    prequantize=1e5,
    toposimplify=0.01,
    prevent_oversimplify=True,
)
country_topology = topojson.Topology(
    countries, object_name="countries", prequantize=2e4, toposimplify=0.02
)
reservation_topology = topojson.Topology(
    reservations, object_name="reservations", prequantize=1e5, toposimplify=0.004, prevent_oversimplify=True
)



def wound_for_d3(topology):
    # d3 reads a counterclockwise outer ring as everything except the polygon,
    # and simplification leaves a few rings reversed or collapsed to a line.
    topology = json.loads(topology.to_json())
    arcs = []
    for arc in topology["arcs"]:
        x = y = 0
        points = []
        for step in arc:
            if "transform" in topology:
                x, y = x + step[0], y + step[1]
                points.append((x, y))
            else:
                points.append(tuple(step))
        arcs.append(points)

    def signed_area(ring):
        points = []
        for index in ring:
            points += arcs[index] if index >= 0 else arcs[~index][::-1]
        return sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(points, points[1:] + points[:1]))

    def rewound(polygon):
        rings = []
        for position, ring in enumerate(polygon):
            area = signed_area(ring)
            if area == 0:
                if position == 0:
                    return None
                continue
            if (area > 0) == (position == 0):
                ring = [~index for index in reversed(ring)]
            rings.append(ring)
        return rings

    for layer in topology["objects"].values():
        for geometry in layer["geometries"]:
            if geometry["type"] == "Polygon":
                geometry["arcs"] = rewound(geometry["arcs"]) or []
            elif geometry["type"] == "MultiPolygon":
                polygons = [rewound(polygon) for polygon in geometry["arcs"]]
                geometry["arcs"] = [polygon for polygon in polygons if polygon]
    return topology


map_layers = {
    "states": json.load(open(download_directory / "states-10m.json", encoding="utf-8")),
    "neighbors": wound_for_d3(country_topology),
    "ceded": wound_for_d3(ceded_topology),
    "res": wound_for_d3(reservation_topology),
}
(site_directory / "data" / "geo.js").write_text(
    "window.GEO=" + json.dumps(map_layers, separators=(",", ":")) + ";", encoding="utf-8"
)
print("Wrote geo.js")

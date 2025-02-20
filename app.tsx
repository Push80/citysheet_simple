import React, { useState, useCallback } from 'react';
import DeckGL from '@deck.gl/react';
import {createRoot} from 'react-dom/client';
import {Color, COORDINATE_SYSTEM, Deck, PickingInfo, OrbitView} from '@deck.gl/core';
import {PathLayer, ArcLayer, TextLayer, PolygonLayer} from '@deck.gl/layers';
import {TripsLayer} from '@deck.gl/geo-layers';
import { connect } from 'http2';

var MAX_WIDTH, MAX_HEIGHT
var START_ANIMATION = false
let currentTime = 0

type Coordinate = [number, number];
type xyzCoordinate = [number, number, number]
interface PathObject {
  path: Coordinate[];
}

type GridLine = {
  path: Coordinate;
};

type Cell = {
  coord: Coordinate;
  name: string;
  rank: number;
  width: number;
  height: number;
  value: string;
  font: string;
  font_size: number;
  formula: string;
  formula_type: number;
  text_color: Color;
  bg_color: Color;
}

const COLOR_RANGE: Color[] = [
  [1, 152, 189], //blue
  [73, 227, 206], //teal
  [115, 254, 86], //green
  [250, 225, 119], //yellow
  [254, 173, 84], //orange
  [209, 55, 78] //red
];
var MAX_rank

type Connection = {
  color: Color,
  from: {
      name: string;
      rank: number;
      coords: [number, number];
  };
  to: {
      name: string;
      rank: number;
      coords: [number, number];
  };
}

type Arc = {
  color: Color,
  path: xyzCoordinate[],
  timestamps: number[]
}

var DECK
var rows, cols, cells, row_layer, col_layer, text_layer, cell_background_layer, tower_layer, arc_layer, trips_layer
var connection_data: Connection[] = []

const HIGHLIGHT_COLOR = [255, 0, 0, 255]

// Create the information window element
const infoWindow = document.createElement("div");
infoWindow.id = "infoWindow";
infoWindow.style.position = "fixed";
infoWindow.style.top = "20px";
infoWindow.style.right = "20px";
infoWindow.style.padding = "15px";
infoWindow.style.backgroundColor = "white";
infoWindow.style.border = "1px solid black";
infoWindow.style.display = "none";  // Hidden initially
infoWindow.style.zIndex = "1000";
document.body.appendChild(infoWindow);

// Add a close button to the info window
const closeButton = document.createElement("button");
closeButton.innerText = "Close";
closeButton.onclick = () => {
  infoWindow.style.display = "none";
};
infoWindow.appendChild(closeButton);

// Function to display the info window with the selected polygon's information
function showInfoWindow(polygonData) {
  infoWindow.style.display = "block";
  infoWindow.innerHTML = `<strong>${polygonData.name}</strong><br>${polygonData.value}`;
  infoWindow.appendChild(closeButton);  // Add close button to window content
}

const fpsPanel = document.createElement("div");
infoWindow.id = "fpsPanel";
infoWindow.style.position = "fixed";
infoWindow.style.top = "20px";
infoWindow.style.right = "20px";
infoWindow.style.padding = "15px";
infoWindow.style.backgroundColor = "white";
infoWindow.style.border = "1px solid black";
infoWindow.style.zIndex = "1000";
document.body.appendChild(fpsPanel);

function getTooltip({object}: PickingInfo) {
  if (!object) {
    return null;
  }
  if (object.name) {
    const name = object.name;
    const value = object.value;
    return `\
      Cell: ${name}
      ${value}`;
  } else if (object.to) {
    return `\
      Arc from ${object.from.name} to ${object.to.name}`;
  }
  

  
}

export default function App() {
  var hovered_id = [""]
  var hovered_type = ""
  // Define the path to the JSON file
  const filepath = "./small_test.json"
  console.log(filepath)
  // Read the JSON file and parse it
  fetch(`${import.meta.env.BASE_URL}small_test.json`)
      .then(response => response.json())
      .then(data => {
          MAX_WIDTH = 0
          MAX_HEIGHT = 0
          rows = rows = data.flatMap((sheet: any) => Object.values(sheet)[0].rows || []);
          cols = data.flatMap((sheet: any) => Object.values(sheet)[0].cols || []);
          cells = data.flatMap((sheet: any) => Object.values(sheet)[0].cells || []);
          MAX_rank = Math.max(...cells.map(c => c.rank));

          if (Array.isArray(rows) && Array.isArray(cols)) {
            row_layer = draw_lines(rows, "RowPaths");
            col_layer = draw_lines(cols, "ColPaths");
            draw_cells()
            draw_cell_backgrounds()
            draw_towers()
            draw_arcs()
            draw_trips()

            

            DECK = new Deck({
              initialViewState: {
                target: [450, -100, 0],  // Center the view on (0,0) in Cartesian space
                zoom: -0.05,
                rotationX: 90,
                rotationOrbit: 0,
              },
              controller: {
                dragMode: 'pan' // Invert controls: regular drag pans, Ctrl+drag rotates
              },
              views: new OrbitView({ far: 100000, near: 0.10, orthographic: false}),
              layers: [row_layer, col_layer, text_layer, cell_background_layer, tower_layer, arc_layer, trips_layer],
              getTooltip: getTooltip
            });
            setTimeout(() => {
              START_ANIMATION = true
              update()
            }, 1);
            // Start the animation loop
            
            setTimeout(() => {
              animateTripsLayer();
            }, 1700);

            function updateFps() {
              let fps = Math.round(DECK.metrics.fps);
              fpsPanel.textContent = `FPS: ${fps}`;
              requestAnimationFrame(updateFps);
            }
            setInterval(updateFps, 10);
            

            function animateTripsLayer() {
              const intervalId = setInterval(() => {
                currentTime++;
                //update()
                // Optional: Stop after reaching a certain count
                if (currentTime >= 170) {
                    currentTime = 50
                }
              }, 1000);
            }
            
            
          }
      })
      .catch(error => console.error("Error fetching JSON:", error));

  function draw_lines(coords: PathObject[], id: string): PathLayer<GridLine> {
    //This is currently drawing the grid using an array of coordinates
    const path_layer = new PathLayer<GridLine>({
      id: id,
      data: coords,
      getPath: (d: GridLine) => d.path,
      getWidth: 1,
      pickable: true,
      coordinateSystem: COORDINATE_SYSTEM.CARTESIAN
    });
    return path_layer;
  }

  function draw_cells(): TextLayer<Cell> {
    text_layer = new TextLayer<Cell>({
      id: "CellLayer",
      data: cells,

      //background: true,
      billboard: false,
      getPosition: (d: Cell) => [d.coord[0]+2, d.coord[1]-2, (d.rank * 20)  + 4],
      getText: (d: Cell) => d.value,
      /*
      getBackgroundColor: (d: Cell) => {
        const hex = d.background_color;
        // convert to RGB
        return hex.match(/[0-9a-f]{2}/g).map(x => parseInt(x, 16));
      },
      getColor: (d: Cell) => {
        const hex = d.color;
        // convert to RGB
        return hex.match(/[0-9a-f]{2}/g).map(x => parseInt(x, 16));
      },*/
      sizeScale: 0.25,
      sizeUnits: 'common',
      getAlignmentBaseline: 'top',
      getTextAnchor: 'start',

    })
    return text_layer;
  }

  function draw_cell_backgrounds(): PolygonLayer<Cell> {
    cell_background_layer = new PolygonLayer<Cell>({
      id: "CellBackground",
      data: cells,
      transitions: {
        getPolygon: 1000
      },
      stroked: false,
      extruded: true,
      getElevation: 0.5,
      material: false,
      filled: true,
      getPolygon: (d: Cell) => {
        var top_left, top_right, bottom_left, bottom_right
        const elevation = d.rank * 20 + 1
        const buffer = 0.5
        top_left = [d.coord[0] + buffer, d.coord[1] - buffer, elevation]
        top_right = [d.coord[0] + d.width - buffer, d.coord[1] - buffer, elevation]
        bottom_left = [d.coord[0] + buffer, d.coord[1] - d.height + buffer, elevation]
        bottom_right = [d.coord[0] + d.width - buffer, d.coord[1] - d.height + buffer, elevation]
        return [top_left, top_right, bottom_right, bottom_left]
      },
      getFillColor: (d: Cell) => d.bg_color,
    })
    return cell_background_layer
  }

  function draw_towers(): PolygonLayer<Cell> {
    const cells_filtered = cells.filter(cell => cell.rank != 0)
    tower_layer = new PolygonLayer<Cell>({
      id: "TowerLayer",
      data: cells_filtered,
      getElevation: (d: Cell) => {
        const elevation = START_ANIMATION ? (d.rank * 20) - 1: 0
        return elevation
      },
      transitions: {
        getElevation: 1000
      },
      opacity: 0.2,
      getPolygon: (d: Cell) => {
        var top_left, top_right, bottom_left, bottom_right
        top_left = [d.coord[0], d.coord[1]]
        top_right = [d.coord[0] + d.width, d.coord[1]]
        bottom_left = [d.coord[0], d.coord[1] - d.height]
        bottom_right = [d.coord[0] + d.width, d.coord[1] - d.height]
        return [top_left, top_right, bottom_right, bottom_left]
      },/*{
        const center_x = d.coord[0] + (d.width / 2)
        const center_y = d.coord[1] - (d.height / 2)
        return [center_x, center_y]
      },*/
      onClick: ({ object }) => {
        if (object) {
          showInfoWindow(object);  // Show info when polygon is clicked
        }
      },
      getFillColor: (d: Cell) => {
        let color_bucket = Math.floor((COLOR_RANGE.length - 1) * d.rank / MAX_rank)
        let color = COLOR_RANGE[color_bucket];
        return d.rank === 0 ? color : color;
      },

      extruded: true,

      //handle hover logic so that towers have arcs feeding into them be highlighted
      pickable: true,
      onHover: info => {
        const old_hovered_id = hovered_id
        hovered_id = (info.object ? [info.object.name] : [null]);
        hovered_type = "tower"
        if (hovered_id != old_hovered_id) {
          update()
        }
      },
      updateTriggers: {
        getFillColor: [hovered_id], // Only update when hovered_id changes
      }
    })
    return tower_layer
  }
  function draw_arcs(): ArcLayer<Connection> {
    //Finds every connection between towers to draw arcs
    connection_data = getConnections()

    var connections_to_tower
    if (hovered_type == "tower") {
      connections_to_tower = findPathsToTarget(hovered_id[0])
    }
    arc_layer = new ArcLayer<Connection>({
      id: 'ArcLayer',
      data: connection_data,
      getSourcePosition: (d: Connection) => {
        return [d.from.coords[0], d.from.coords[1], START_ANIMATION ? d.from.rank * 20  : 0]
      },
      getTargetPosition: (d: Connection) => [d.to.coords[0], d.to.coords[1], START_ANIMATION ? d.to.rank * 20  : 0],
      transitions: {
        getSourcePosition: 1000,
        getTargetPosition: 1000
      },
      getSourceColor: (d: Connection) => {
        var opacity = 50 // 64 = 0.25 opacity, 255 = 1.0 opacity
        if (hovered_type == "arc") {
          if (d.from.name === hovered_id[0] && d.to.name === hovered_id[1]) {
            opacity = 255
          }      
        } else if (hovered_type == "tower") {
          if (connections_to_tower.some(path => path[0] === d.from.name && path[1] === d.to.name)) {
            opacity = 255
          }
        }
        let color = d.color
        return [color[0], color[1], color[2], opacity]
        return [48, 128, Math.sqrt(d.from.rank ) * 15, opacity]
      },
      getTargetColor: (d: Connection) => {
        var opacity = 50 // 64 = 0.25 opacity, 255 = 1.0 opacity
        if (hovered_type == "arc") {
          if (d.from.name === hovered_id[0] && d.to.name === hovered_id[1]) {
            opacity = 255
          }      
        } else if (hovered_type == "tower") {
          if (connections_to_tower.some(path => path[0] === d.from.name && path[1] === d.to.name)) {
            opacity = 255
          }
        }
        let color = d.color
        return [color[0], color[1], color[2], opacity]
        return [48, 128, Math.sqrt(d.to.rank ) * 15, opacity]
      },
      getWidth: 5,
      widthUnits: "common",
      pickable: true,
      getHeight: (d: Connection) => {
        return getHeight(d);
      },

      onHover: info => {
        const old_hovered_id = hovered_id
        hovered_id = (info.object ? [info.object.from.name, info.object.to.name] : [null]);
        hovered_type = "arc"

        if (hovered_id != old_hovered_id) {
          update()
        }
      },
      updateTriggers: {
        getSourceColor: [hovered_id], // Only update when hovered_id changes
        getTargetColor: [hovered_id]  // Only update when hovered_id changes
      },
      
    });
    return arc_layer
    type CellPath = [string, string];
    function findPathsToTarget(target: string): CellPath[] {
      // Helper function to recursively find paths to a specific target
      function findPaths(curr_target: string): CellPath[] {
          // Find all connections that lead to the current target
          const connections_to_target = connection_data.filter(c => c.to.name === curr_target);
  
          const paths: CellPath[] = [];
          
          for (const c of connections_to_target) {
              const source = c.from.name;
              const target = c.to.name;
  
              // Add the direct connection pair [source, target] to paths
              paths.push([source, target]);
  
              // Recursively find paths to the source
              const subPaths = findPaths(source);
              
              // For each subpath, add the current connection as the next step
              for (const subPath of subPaths) {
                  paths.push(subPath);
              }
          }
          
          return paths;
      }
      // Initialize by finding paths to the initial target
      return findPaths(target);
    }
  }


  function draw_trips(): void {
    const arc_segment_data: Arc[] = []
    connection_data.forEach(connection => {
      const source_xyz: xyzCoordinate = [connection.from.coords[0], connection.from.coords[1], connection.from.rank ]
      const target_xyz: xyzCoordinate = [connection.to.coords[0], connection.to.coords[1], connection.to.rank ]
      const arc_seg = calculateArcSegments(source_xyz, target_xyz, 200, getHeight(connection))
      for (let j = 0; j <= arc_seg.length; j += arc_seg.length / 5) {
        const arc: Arc = {
          color: connection.color,
          path: arc_seg,
          timestamps: Array.from({ length: arc_seg.length }, (_, i) => j + i * 0.5) //(i * timestamp=1)
        }
        arc_segment_data.push(arc);

      }
      
    });
    return;
    trips_layer = new TripsLayer<Arc>({
      id: 'TripsLayer',
      data: arc_segment_data,
      
      getPath: (d: Arc) => d.path,
      // Timestamp is stored as float32, do not return a long int as it will cause precision loss
      getTimestamps: (d: Arc) => d.timestamps,
      getColor: (d: Arc) => {
        let source = d.path[0]
        let target = d.path[50]
        const dist = Math.sqrt(Math.pow(source[0] - target[0], 2) + (source[1] - target[1], 2));
        return d.color
        return [48, 128, Math.sqrt(dist / 4) * 15, 255]
      },
      currentTime,
      trailLength: 5,
      capRounded: true,
      jointRounded: true,
      billboard: true,
      getWidth: 4,
      widthScale: 1,
      widthUnits: 'common',
    });
  }

  function update(): void {
    draw_cell_backgrounds()
    draw_towers()
    draw_arcs()
    draw_trips()
    const layers = [row_layer, col_layer, text_layer, cell_background_layer, arc_layer, tower_layer, trips_layer]
    DECK.setProps({layers})
  }

  function getConnections(): Connection[] {
    // Create a lookup dictionary for quick access by cell name
    const cell_lookup: Record<string, Cell> = {};
    cells.forEach(cell => {
        cell_lookup[cell.name] = cell;
    });

    // Iterate over each cell in the input data
    const connections : Connection[] = []
    cells.forEach(cell => {
      const from_cell = cell;
      // For each cell in the "used_by" array, create a new Connection object
      from_cell.used_by.forEach(to_cell_name => {
          const to_cell = cell_lookup[to_cell_name];
          if (to_cell) { // Only proceed if the target cell is found
              const width =Math.abs(from_cell.coord[0] - to_cell.coord[0]);
              const height =Math.abs(from_cell.coord[1] - to_cell.coord[1]);
              MAX_WIDTH = (width > MAX_WIDTH) ? width : MAX_WIDTH;
              MAX_HEIGHT = (height > MAX_HEIGHT) ? height : MAX_HEIGHT;

              const connection: Connection = {
                  color: COLOR_RANGE[to_cell.formula_type % COLOR_RANGE.length],
                  from: {
                      name: from_cell.name,
                      rank: from_cell.rank,
                      coords: [from_cell.coord[0] + from_cell.width / 2, from_cell.coord[1] - from_cell.height / 2]
                  },
                  to: {
                      name: to_cell_name,
                      rank: to_cell.rank,
                      coords: [to_cell.coord[0] + to_cell.width / 2, to_cell.coord[1] - to_cell.height / 2]
                  }
              };
              connections.push(connection);
          }
      });
    });
    return connections
  }

  function getHeight(c: Connection): number {
    const dist = Math.sqrt(Math.pow(c.from.coords[0] - c.to.coords[0], 2) + (c.from.coords[1] - c.to.coords[1], 2));
    const max_dist = Math.sqrt(Math.pow(MAX_WIDTH, 2) + Math.pow(MAX_HEIGHT, 2));
    const normalized_dist =  1 - dist / max_dist;
    const min = 0.4
    const max = 3
    var height = min + normalized_dist * (max - min)
    return height
  };

  function calculateArcSegments(source: xyzCoordinate, target: xyzCoordinate, num_segments: number = 200, height: number // Adjust to control arc curvature
  ): xyzCoordinate[] {
      const segments: xyzCoordinate[] = [];
      for (let i = 0; i <= num_segments; i++) {
          const t = i / num_segments;
          const interpolated = interpolateArc(source, target, t, height);
          segments.push(interpolated);
      }
      return segments;
  };

  function interpolateArc(source: xyzCoordinate, target: xyzCoordinate, t: number, height: number): xyzCoordinate {
    const x = source[0] * (1 - t) + target[0] * t;
    const y = source[1] * (1 - t) + target[1] * t;

    // Sinusoidal interpolation for z (vertical curvature)
    const dist = Math.sqrt(Math.pow(target[0] - source[0], 2) + Math.pow(target[1] - source[1], 2));
    const z = paraboloid(dist, source[2], target[2], t, height) + 1

    return [x, y, z];

    // Helper function to calculate the height (z) based on a parabolic curve.
    function paraboloid(distance: number, sourceZ: number, targetZ: number, theta: number, height: number): number {
      const deltaZ = targetZ - sourceZ;
      const dh = distance * height;
      if (dh === 0.0) {
          return sourceZ + deltaZ * theta;
      }
      const unitZ = deltaZ / dh;
      const p2 = unitZ * unitZ + 1;

      const dir = deltaZ >= 0 ? 1 : -1;  // Handle direction of the curve.
      const z0 = dir === 1 ? sourceZ : targetZ;
      const r = dir === 1 ? theta : 1.0 - theta;
      return Math.sqrt(r * (p2 - r)) * dh + z0;
    }
  };
}






export function renderToDOM(container: HTMLDivElement) {
  createRoot(container).render(<App />);
}



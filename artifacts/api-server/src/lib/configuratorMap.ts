import { priceLineItemsFromCostEngine } from "./costLookup";
import { getRegionalMultiplier } from "./costEngine";
import { createHash } from "crypto";

const configuratorQuoteCache = new Map<string, ConfiguratorQuoteResult>();
const CACHE_TTL_MS = 10 * 60 * 1000;
setInterval(() => configuratorQuoteCache.clear(), CACHE_TTL_MS);

interface ConfiguratorOption {
  label: string;
  price: string;
  item: string;
  qualityTier: string;
}

interface ConfiguratorGroup {
  label: string;
  key: string;
  options: ConfiguratorOption[];
  contextKeywords?: string[];
}

interface ConfiguratorRenovationType {
  label: string;
  groups: ConfiguratorGroup[];
  category: string;
  defaultQuantities: (property: PropertyInfo) => Record<string, { quantity: number; unit: string }>;
}

interface PropertyInfo {
  sqft: number;
  bedrooms: number;
  bathrooms: number;
  yearBuilt: number | null;
  zipCode: string;
}

export const CONFIGURATOR_MAP: Record<string, ConfiguratorRenovationType> = {
  kitchen: {
    label: "Kitchen Remodel",
    category: "kitchen",
    groups: [
      {
        label: "Countertops",
        key: "countertops",
        options: [
          { label: "Laminate", price: "$", item: "Countertop (laminate)", qualityTier: "economy" },
          { label: "Granite", price: "$$", item: "Countertop (granite)", qualityTier: "mid_range" },
          { label: "Quartz", price: "$$$", item: "Countertop (quartz)", qualityTier: "premium" },
        ],
      },
      {
        label: "Cabinets",
        key: "cabinets",
        options: [
          { label: "Stock", price: "$", item: "Cabinets (stock)", qualityTier: "economy" },
          { label: "Semi-Custom", price: "$$", item: "Cabinets (semi-custom)", qualityTier: "mid_range" },
          { label: "Custom", price: "$$$", item: "Cabinets (custom)", qualityTier: "premium" },
        ],
      },
      {
        label: "Backsplash",
        key: "backsplash",
        options: [
          { label: "Ceramic", price: "$", item: "Backsplash (ceramic)", qualityTier: "economy" },
          { label: "Glass Tile", price: "$$", item: "Backsplash (glass tile)", qualityTier: "mid_range" },
          { label: "Natural Stone", price: "$$$", item: "Backsplash (natural stone)", qualityTier: "premium" },
        ],
      },
    ],
    defaultQuantities: (p) => ({
      countertops: { quantity: Math.max(25, Math.round(p.sqft * 0.02)), unit: "sqft" },
      cabinets: { quantity: Math.max(15, Math.round(p.sqft * 0.015)), unit: "linear_ft" },
      backsplash: { quantity: Math.max(20, Math.round(p.sqft * 0.015)), unit: "sqft" },
    }),
  },
  bathroom: {
    label: "Bathroom Remodel",
    category: "bathroom",
    groups: [
      {
        label: "Vanity",
        key: "vanity",
        options: [
          { label: "Stock", price: "$", item: "Vanity (stock)", qualityTier: "economy" },
          { label: "Semi-Custom", price: "$$", item: "Vanity (semi-custom)", qualityTier: "mid_range" },
          { label: "Custom", price: "$$$", item: "Vanity (custom)", qualityTier: "premium" },
        ],
      },
      {
        label: "Toilet",
        key: "toilet",
        options: [
          { label: "Standard", price: "$", item: "Toilet (standard)", qualityTier: "economy" },
          { label: "Mid-Range", price: "$$", item: "Toilet (mid-range)", qualityTier: "mid_range" },
          { label: "High-End", price: "$$$", item: "Toilet (high-end)", qualityTier: "premium" },
        ],
      },
      {
        label: "Tub / Shower",
        key: "tubShower",
        options: [
          { label: "Fiberglass", price: "$", item: "Tub/Shower (fiberglass)", qualityTier: "economy" },
          { label: "Acrylic", price: "$$", item: "Tub/Shower (acrylic)", qualityTier: "mid_range" },
          { label: "Cast Iron", price: "$$$", item: "Tub/Shower (cast iron/freestanding)", qualityTier: "premium" },
        ],
      },
      {
        label: "Tile",
        key: "tile",
        options: [
          { label: "Ceramic", price: "$", item: "Tile (ceramic)", qualityTier: "economy" },
          { label: "Porcelain", price: "$$", item: "Tile (porcelain)", qualityTier: "mid_range" },
          { label: "Marble", price: "$$$", item: "Tile (marble)", qualityTier: "premium" },
        ],
      },
    ],
    defaultQuantities: (p) => ({
      vanity: { quantity: Math.max(1, p.bathrooms), unit: "each" },
      toilet: { quantity: Math.max(1, p.bathrooms), unit: "each" },
      tubShower: { quantity: Math.max(1, p.bathrooms), unit: "each" },
      tile: { quantity: Math.max(50, Math.round(p.bathrooms * 80)), unit: "sqft" },
    }),
  },
  flooring: {
    label: "Flooring",
    category: "flooring",
    groups: [
      {
        label: "Flooring Type",
        key: "flooringType",
        options: [
          { label: "Laminate", price: "$", item: "Laminate", qualityTier: "economy" },
          { label: "Vinyl Plank (LVP)", price: "$", item: "Vinyl plank (LVP)", qualityTier: "economy" },
          { label: "Engineered Hardwood", price: "$$", item: "Engineered hardwood", qualityTier: "mid_range" },
          { label: "Solid Hardwood", price: "$$$", item: "Solid hardwood", qualityTier: "premium" },
          { label: "Carpet (Builder)", price: "$", item: "Carpet (builder grade)", qualityTier: "economy" },
          { label: "Carpet (Premium)", price: "$$", item: "Carpet (premium)", qualityTier: "mid_range" },
        ],
      },
    ],
    defaultQuantities: (p) => ({
      flooringType: { quantity: Math.max(200, Math.round(p.sqft * 0.7)), unit: "sqft" },
    }),
  },
  painting: {
    label: "Interior Painting",
    category: "painting",
    groups: [
      {
        label: "Paint Grade",
        key: "paintGrade",
        options: [
          { label: "Builder Grade", price: "$", item: "Interior paint (builder grade)", qualityTier: "economy" },
          { label: "Premium", price: "$$", item: "Interior paint (premium)", qualityTier: "mid_range" },
          { label: "Designer", price: "$$$", item: "Interior paint (designer)", qualityTier: "premium" },
        ],
      },
    ],
    defaultQuantities: (p) => ({
      paintGrade: { quantity: Math.max(500, Math.round(p.sqft * 3)), unit: "sqft" },
    }),
  },
  windows: {
    label: "Window Replacement",
    category: "windows",
    groups: [
      {
        label: "Window Type",
        key: "windowType",
        options: [
          { label: "Vinyl Standard", price: "$", item: "Vinyl window (standard)", qualityTier: "economy" },
          { label: "Double-Pane Vinyl", price: "$$", item: "Double-pane vinyl", qualityTier: "mid_range" },
          { label: "Wood / Fiberglass", price: "$$$", item: "Wood/fiberglass window", qualityTier: "premium" },
        ],
      },
    ],
    defaultQuantities: (p) => ({
      windowType: { quantity: Math.max(5, Math.round(p.sqft / 200)), unit: "each" },
    }),
  },
  windowShutters: {
    label: "Window Shutters",
    category: "windowShutters",
    groups: [
      {
        label: "Shutter Material",
        key: "shutterMaterial",
        options: [
          { label: "Vinyl (Basic)", price: "$", item: "Window shutters (vinyl basic)", qualityTier: "economy" },
          { label: "Composite", price: "$$", item: "Window shutters (composite)", qualityTier: "mid_range" },
          { label: "Real Wood", price: "$$$", item: "Window shutters (real wood)", qualityTier: "premium" },
        ],
      },
      {
        label: "Shutter Style",
        key: "shutterStyle",
        options: [
          { label: "Louvered", price: "$", item: "Shutters (louvered style)", qualityTier: "economy" },
          { label: "Board & Batten", price: "$$", item: "Shutters (board and batten)", qualityTier: "mid_range" },
          { label: "Raised Panel", price: "$$$", item: "Shutters (raised panel)", qualityTier: "premium" },
        ],
      },
    ],
    defaultQuantities: (p) => ({
      shutterMaterial: { quantity: Math.max(4, Math.round(p.sqft / 300) * 2), unit: "each" },
      shutterStyle: { quantity: Math.max(4, Math.round(p.sqft / 300) * 2), unit: "each" },
    }),
  },
  staircase: {
    label: "Staircase Renovation",
    category: "staircase",
    groups: [
      {
        label: "Treads",
        key: "treads",
        options: [
          { label: "Carpet Runner", price: "$", item: "Stair treads (carpet runner)", qualityTier: "economy" },
          { label: "Oak Treads", price: "$$", item: "Stair treads (oak)", qualityTier: "mid_range" },
          { label: "Custom Hardwood", price: "$$$", item: "Stair treads (custom hardwood)", qualityTier: "premium" },
        ],
      },
      {
        label: "Railing",
        key: "railing",
        options: [
          { label: "Wood Painted", price: "$", item: "Railing (wood painted)", qualityTier: "economy" },
          { label: "Wood Stained", price: "$$", item: "Railing (wood stained)", qualityTier: "mid_range" },
          { label: "Iron / Cable", price: "$$$", item: "Railing (iron/cable)", qualityTier: "premium" },
        ],
      },
    ],
    defaultQuantities: () => ({
      treads: { quantity: 14, unit: "each" },
      railing: { quantity: 20, unit: "linear_ft" },
    }),
  },
  roof: {
    label: "Roof Replacement",
    category: "roofing",
    groups: [
      {
        label: "Roofing Material",
        key: "roofingMaterial",
        options: [
          { label: "3-Tab Shingles", price: "$", item: "3-tab shingles", qualityTier: "economy" },
          { label: "Architectural Shingles", price: "$$", item: "Architectural shingles", qualityTier: "mid_range" },
          { label: "Metal Roofing", price: "$$$", item: "Metal roofing", qualityTier: "premium" },
        ],
      },
    ],
    defaultQuantities: (p) => ({
      roofingMaterial: { quantity: Math.max(1000, Math.round(p.sqft * 1.15)), unit: "sqft" },
    }),
  },
  hvac: {
    label: "HVAC System",
    category: "hvac",
    groups: [
      {
        label: "System Type",
        key: "systemType",
        options: [
          { label: "Standard Split", price: "$", item: "HVAC system (standard split)", qualityTier: "economy" },
          { label: "High-Efficiency", price: "$$", item: "HVAC system (high-efficiency)", qualityTier: "mid_range" },
          { label: "Heat Pump / Dual", price: "$$$", item: "HVAC system (heat pump)", qualityTier: "premium" },
        ],
      },
      {
        label: "Ductwork",
        key: "ductwork",
        options: [
          { label: "Patch / Repair", price: "$", item: "Ductwork (patch/repair)", qualityTier: "economy" },
          { label: "Partial Replace", price: "$$", item: "Ductwork (partial replace)", qualityTier: "mid_range" },
          { label: "Full Replace", price: "$$$", item: "Ductwork (full replace)", qualityTier: "premium" },
        ],
      },
    ],
    defaultQuantities: (p) => ({
      systemType: { quantity: 1, unit: "each" },
      ductwork: { quantity: Math.max(50, Math.round(p.sqft * 0.05)), unit: "linear_ft" },
    }),
  },
  deck: {
    label: "Deck / Patio",
    category: "deck",
    groups: [
      {
        label: "Decking Material",
        key: "deckingMaterial",
        options: [
          { label: "Pressure-Treated", price: "$", item: "Deck (pressure-treated lumber)", qualityTier: "economy" },
          { label: "Composite", price: "$$", item: "Deck (composite)", qualityTier: "mid_range" },
          { label: "Hardwood / PVC", price: "$$$", item: "Deck (hardwood/PVC)", qualityTier: "premium" },
        ],
      },
      {
        label: "Railing",
        key: "deckRailing",
        options: [
          { label: "Wood", price: "$", item: "Deck railing (wood)", qualityTier: "economy" },
          { label: "Composite", price: "$$", item: "Deck railing (composite)", qualityTier: "mid_range" },
          { label: "Cable / Glass", price: "$$$", item: "Deck railing (cable/glass)", qualityTier: "premium" },
        ],
      },
    ],
    defaultQuantities: (p) => ({
      deckingMaterial: { quantity: Math.max(150, Math.round(p.sqft * 0.15)), unit: "sqft" },
      deckRailing: { quantity: Math.max(30, Math.round(p.sqft * 0.02)), unit: "linear_ft" },
    }),
  },
  garage: {
    label: "Garage Renovation",
    category: "garage",
    groups: [
      {
        label: "Garage Door",
        key: "garageDoor",
        options: [
          { label: "Steel (Non-Insulated)", price: "$", item: "Garage door (steel non-insulated)", qualityTier: "economy" },
          { label: "Steel (Insulated)", price: "$$", item: "Garage door (steel insulated)", qualityTier: "mid_range" },
          { label: "Wood / Custom", price: "$$$", item: "Garage door (wood/custom)", qualityTier: "premium" },
        ],
      },
      {
        label: "Floor Coating",
        key: "garageFloor",
        options: [
          { label: "Epoxy Paint", price: "$", item: "Garage floor (epoxy paint)", qualityTier: "economy" },
          { label: "Epoxy Flake", price: "$$", item: "Garage floor (epoxy flake)", qualityTier: "mid_range" },
          { label: "Polyaspartic", price: "$$$", item: "Garage floor (polyaspartic)", qualityTier: "premium" },
        ],
      },
    ],
    defaultQuantities: () => ({
      garageDoor: { quantity: 1, unit: "each" },
      garageFloor: { quantity: 400, unit: "sqft" },
    }),
  },
  basement: {
    label: "Basement Finishing",
    category: "basement",
    groups: [
      {
        label: "Finishing Level",
        key: "finishLevel",
        options: [
          { label: "Basic (Drywall + Paint)", price: "$", item: "Basement finish (basic)", qualityTier: "economy" },
          { label: "Standard (+ Flooring + Lighting)", price: "$$", item: "Basement finish (standard)", qualityTier: "mid_range" },
          { label: "Full (+ Bathroom + Wet Bar)", price: "$$$", item: "Basement finish (full)", qualityTier: "premium" },
        ],
      },
    ],
    defaultQuantities: (p) => ({
      finishLevel: { quantity: Math.max(400, Math.round(p.sqft * 0.4)), unit: "sqft" },
    }),
  },
  exteriorPaint: {
    label: "Exterior Paint / Siding",
    category: "exteriorPaint",
    groups: [
      {
        label: "Exterior Type",
        key: "exteriorType",
        options: [
          { label: "Paint Only", price: "$", item: "Exterior paint (standard)", qualityTier: "economy" },
          { label: "Paint + Repair", price: "$$", item: "Exterior paint (with repair)", qualityTier: "mid_range" },
          { label: "New Siding", price: "$$$", item: "Siding (vinyl/fiber cement)", qualityTier: "premium" },
        ],
      },
    ],
    defaultQuantities: (p) => ({
      exteriorType: { quantity: Math.max(1000, Math.round(p.sqft * 1.2)), unit: "sqft" },
    }),
  },
  exteriorDoors: {
    label: "Exterior Doors",
    category: "exteriorDoors",
    groups: [
      {
        label: "Front Door",
        key: "frontDoor",
        contextKeywords: ["front door", "entry door", "front of the house", "main door", "front entrance"],
        options: [
          { label: "Steel Entry", price: "$", item: "Front door (steel entry)", qualityTier: "economy" },
          { label: "Fiberglass", price: "$$", item: "Front door (fiberglass)", qualityTier: "mid_range" },
          { label: "Solid Wood", price: "$$$", item: "Front door (solid wood)", qualityTier: "premium" },
        ],
      },
      {
        label: "Rear / Patio Door",
        key: "rearDoor",
        contextKeywords: ["patio door", "rear door", "back door", "sliding door", "french door", "back of the house"],
        options: [
          { label: "Sliding Vinyl", price: "$", item: "Patio door (sliding vinyl)", qualityTier: "economy" },
          { label: "Sliding Fiberglass", price: "$$", item: "Patio door (sliding fiberglass)", qualityTier: "mid_range" },
          { label: "French Door (Wood)", price: "$$$", item: "Patio door (french wood)", qualityTier: "premium" },
        ],
      },
      {
        label: "Hardware",
        key: "doorHardware",
        contextKeywords: ["hardware", "lock", "handle", "smart lock", "door knob", "deadbolt"],
        options: [
          { label: "Standard", price: "$", item: "Door hardware (standard)", qualityTier: "economy" },
          { label: "Smart Lock", price: "$$", item: "Door hardware (smart lock)", qualityTier: "mid_range" },
          { label: "Premium Smart", price: "$$$", item: "Door hardware (premium smart)", qualityTier: "premium" },
        ],
      },
    ],
    defaultQuantities: () => ({
      frontDoor: { quantity: 1, unit: "each" },
      rearDoor: { quantity: 1, unit: "each" },
      doorHardware: { quantity: 2, unit: "each" },
    }),
  },
  landscaping: {
    label: "Landscaping",
    category: "landscaping",
    groups: [
      {
        label: "Lawn & Plants",
        key: "lawnPlants",
        options: [
          { label: "Seed + Mulch", price: "$", item: "Landscaping (seed/mulch)", qualityTier: "economy" },
          { label: "Sod + Shrubs", price: "$$", item: "Landscaping (sod/shrubs)", qualityTier: "mid_range" },
          { label: "Full Design", price: "$$$", item: "Landscaping (full design)", qualityTier: "premium" },
        ],
      },
      {
        label: "Hardscape",
        key: "hardscape",
        options: [
          { label: "Gravel Paths", price: "$", item: "Hardscape (gravel)", qualityTier: "economy" },
          { label: "Pavers", price: "$$", item: "Hardscape (pavers)", qualityTier: "mid_range" },
          { label: "Natural Stone", price: "$$$", item: "Hardscape (natural stone)", qualityTier: "premium" },
        ],
      },
    ],
    defaultQuantities: (p) => ({
      lawnPlants: { quantity: Math.max(500, Math.round(p.sqft * 0.3)), unit: "sqft" },
      hardscape: { quantity: Math.max(100, Math.round(p.sqft * 0.05)), unit: "sqft" },
    }),
  },
  interiorTrim: {
    label: "Interior Trim & Molding",
    category: "interiorTrim",
    groups: [
      {
        label: "Trim Type",
        key: "trimType",
        options: [
          { label: "Baseboards Only", price: "$", item: "Baseboards (standard)", qualityTier: "economy" },
          { label: "Crown & Baseboards", price: "$$", item: "Crown molding and baseboards", qualityTier: "mid_range" },
          { label: "Full Millwork/Wainscoting", price: "$$$", item: "Wainscoting and millwork (custom)", qualityTier: "premium" },
        ],
      },
    ],
    defaultQuantities: (p) => ({
      trimType: { quantity: Math.max(200, Math.round(p.sqft * 0.8)), unit: "linear_ft" },
    }),
  },
  interiorDoors: {
    label: "Interior Doors",
    category: "interiorDoors",
    groups: [
      {
        label: "Door Style",
        key: "interiorDoorStyle",
        options: [
          { label: "Hollow Core (Basic)", price: "$", item: "Interior door (hollow core)", qualityTier: "economy" },
          { label: "Solid Core", price: "$$", item: "Interior door (solid core)", qualityTier: "mid_range" },
          { label: "Custom/Barn Doors", price: "$$$", item: "Interior door (custom/barn)", qualityTier: "premium" },
        ],
      },
    ],
    defaultQuantities: (p) => ({
      interiorDoorStyle: { quantity: Math.max(5, Math.round(p.sqft / 300)), unit: "each" },
    }),
  },
  siding: {
    label: "Siding & Gutters",
    category: "siding",
    groups: [
      {
        label: "Siding Material",
        key: "sidingMaterial",
        options: [
          { label: "Vinyl Siding", price: "$", item: "Vinyl siding", qualityTier: "economy" },
          { label: "Engineered Wood", price: "$$", item: "Engineered wood siding", qualityTier: "mid_range" },
          { label: "Fiber Cement", price: "$$$", item: "Fiber cement siding (Hardie)", qualityTier: "premium" },
        ],
      },
      {
        label: "Gutters",
        key: "gutters",
        options: [
          { label: "Aluminum Seamless", price: "$", item: "Gutters (aluminum seamless)", qualityTier: "economy" },
          { label: "Copper/Custom", price: "$$$", item: "Gutters (copper/custom)", qualityTier: "premium" },
        ],
      },
    ],
    defaultQuantities: (p) => ({
      sidingMaterial: { quantity: Math.max(1500, Math.round(p.sqft * 1.5)), unit: "sqft" },
      gutters: { quantity: Math.max(100, Math.round(p.sqft * 0.1)), unit: "linear_ft" },
    }),
  },
  deckPorch: {
    label: "Decks, Porches & Sunrooms",
    category: "deckPorch",
    groups: [
      {
        label: "Structure Type",
        key: "outdoorStructure",
        options: [
          { label: "Wood Deck", price: "$", item: "Wood deck (pressure-treated)", qualityTier: "economy" },
          { label: "Composite Deck", price: "$$", item: "Composite deck", qualityTier: "mid_range" },
          { label: "Sunroom/Screened Porch", price: "$$$", item: "Sunroom or screened porch", qualityTier: "premium" },
        ],
      },
    ],
    defaultQuantities: (p) => ({
      outdoorStructure: { quantity: Math.max(150, Math.round(p.sqft * 0.15)), unit: "sqft" },
    }),
  },
  plumbingSystems: {
    label: "Plumbing & Water Systems",
    category: "plumbingSystems",
    groups: [
      {
        label: "Water Heater",
        key: "waterHeater",
        options: [
          { label: "Standard Tank", price: "$", item: "Water heater (standard tank)", qualityTier: "economy" },
          { label: "Tankless", price: "$$", item: "Water heater (tankless)", qualityTier: "mid_range" },
        ],
      },
      {
        label: "Water Treatment",
        key: "waterTreatment",
        options: [
          { label: "Basic Softener", price: "$", item: "Water softener (basic)", qualityTier: "economy" },
          { label: "Whole Home Filtration", price: "$$$", item: "Whole home water filtration", qualityTier: "premium" },
        ],
      },
    ],
    defaultQuantities: () => ({
      waterHeater: { quantity: 1, unit: "each" },
      waterTreatment: { quantity: 1, unit: "each" },
    }),
  },
  electricalSolar: {
    label: "Electrical, Solar & EV",
    category: "electricalSolar",
    groups: [
      {
        label: "Electrical Upgrades",
        key: "electricalUpgrade",
        options: [
          { label: "EV Charger Install", price: "$", item: "EV charger installation", qualityTier: "economy" },
          { label: "Panel Upgrade (200A)", price: "$$", item: "Electrical panel upgrade (200A)", qualityTier: "mid_range" },
          { label: "Whole Home Rewire", price: "$$$", item: "Whole home electrical rewire", qualityTier: "premium" },
        ],
      },
      {
        label: "Solar/Power",
        key: "solarPower",
        options: [
          { label: "Portable Generator Hookup", price: "$", item: "Generator hookup/transfer switch", qualityTier: "economy" },
          { label: "Solar Panel System", price: "$$$", item: "Solar panel system", qualityTier: "premium" },
        ],
      },
    ],
    defaultQuantities: () => ({
      electricalUpgrade: { quantity: 1, unit: "each" },
      solarPower: { quantity: 1, unit: "each" },
    }),
  },
  lighting: {
    label: "Lighting & Smart Home",
    category: "lighting",
    groups: [
      {
        label: "Fixture Type",
        key: "fixtureType",
        options: [
          { label: "Standard Fixtures", price: "$", item: "Light fixture (standard)", qualityTier: "economy" },
          { label: "Recessed Cans", price: "$$", item: "Recessed lighting (can lights)", qualityTier: "mid_range" },
          { label: "Designer/Chandeliers", price: "$$$", item: "Designer chandelier/pendant", qualityTier: "premium" },
        ],
      },
      {
        label: "Smart Home",
        key: "smartHome",
        options: [
          { label: "Security System", price: "$", item: "Smart home security system", qualityTier: "economy" },
          { label: "Full Automation System", price: "$$", item: "Full smart home automation", qualityTier: "mid_range" },
        ],
      },
    ],
    defaultQuantities: (p) => ({
      fixtureType: { quantity: Math.max(5, Math.round(p.sqft / 200)), unit: "each" },
      smartHome: { quantity: 1, unit: "each" },
    }),
  },
  specialtyRooms: {
    label: "Specialty Rooms (Office/Gym/Laundry)",
    category: "specialtyRooms",
    groups: [
      {
        label: "Room Type",
        key: "specialtyRoomType",
        options: [
          { label: "Laundry/Mudroom", price: "$", item: "Laundry room or mudroom remodel", qualityTier: "economy" },
          { label: "Home Office/Gym", price: "$$", item: "Home office or gym build-out", qualityTier: "mid_range" },
          { label: "Theater/Wine Cellar", price: "$$$", item: "Home theater or wine cellar", qualityTier: "premium" },
        ],
      },
      {
        label: "Finish Level",
        key: "specialtyFinish",
        options: [
          { label: "Basic Update", price: "$", item: "Basic room update (paint/flooring)", qualityTier: "economy" },
          { label: "Custom Built-ins", price: "$$", item: "Custom built-in cabinetry", qualityTier: "mid_range" },
        ],
      },
    ],
    defaultQuantities: () => ({
      specialtyRoomType: { quantity: 1, unit: "each" },
      specialtyFinish: { quantity: 1, unit: "each" },
    }),
  },
  basementAttic: {
    label: "Basement & Attic Finishing",
    category: "basementAttic",
    groups: [
      {
        label: "Space Type",
        key: "bonusSpaceType",
        options: [
          { label: "Attic Conversion", price: "$$", item: "Attic conversion to living space", qualityTier: "mid_range" },
          { label: "Basement Finishing", price: "$$$", item: "Basement full finishing", qualityTier: "premium" },
        ],
      },
      {
        label: "Inclusions",
        key: "bonusSpaceExtras",
        options: [
          { label: "Open Concept Only", price: "$", item: "Open concept finish (drywall/paint)", qualityTier: "economy" },
          { label: "Add Bathroom/Wet Bar", price: "$$$", item: "Bathroom or wet bar addition", qualityTier: "premium" },
        ],
      },
    ],
    defaultQuantities: (p) => ({
      bonusSpaceType: { quantity: Math.max(400, Math.round(p.sqft * 0.4)), unit: "sqft" },
      bonusSpaceExtras: { quantity: 1, unit: "each" },
    }),
  },
  closets: {
    label: "Custom Closets & Storage",
    category: "closets",
    groups: [
      {
        label: "System Type",
        key: "closetSystem",
        options: [
          { label: "Wire Shelving", price: "$", item: "Closet system (wire shelving)", qualityTier: "economy" },
          { label: "Laminate Built-ins", price: "$$", item: "Closet system (laminate built-in)", qualityTier: "mid_range" },
          { label: "Custom Wood", price: "$$$", item: "Closet system (custom wood)", qualityTier: "premium" },
        ],
      },
      {
        label: "Scope",
        key: "closetScope",
        options: [
          { label: "Single Reach-in", price: "$", item: "Reach-in closet organization", qualityTier: "economy" },
          { label: "Primary Walk-in", price: "$$", item: "Walk-in closet organization", qualityTier: "mid_range" },
        ],
      },
    ],
    defaultQuantities: () => ({
      closetSystem: { quantity: 1, unit: "each" },
      closetScope: { quantity: 1, unit: "each" },
    }),
  },
  fencing: {
    label: "Fencing & Gates",
    category: "fencing",
    groups: [
      {
        label: "Fence Material",
        key: "fenceMaterial",
        options: [
          { label: "Chain Link", price: "$", item: "Chain link fence", qualityTier: "economy" },
          { label: "Treated Wood", price: "$$", item: "Wood fence (pressure-treated)", qualityTier: "mid_range" },
          { label: "Vinyl/Composite", price: "$$$", item: "Vinyl or composite fence", qualityTier: "premium" },
        ],
      },
      {
        label: "Fence Style",
        key: "fenceStyle",
        options: [
          { label: "4-Foot Picket", price: "$", item: "Picket fence (4-foot)", qualityTier: "economy" },
          { label: "6-Foot Privacy", price: "$$", item: "Privacy fence (6-foot)", qualityTier: "mid_range" },
        ],
      },
    ],
    defaultQuantities: (p) => ({
      fenceMaterial: { quantity: Math.max(100, Math.round(p.sqft * 0.1)), unit: "linear_ft" },
      fenceStyle: { quantity: 1, unit: "each" },
    }),
  },
  outdoorLiving: {
    label: "Outdoor Living & Pools",
    category: "outdoorLiving",
    groups: [
      {
        label: "Feature Type",
        key: "outdoorFeature",
        options: [
          { label: "Fire Pit or Pergola", price: "$", item: "Fire pit or pergola installation", qualityTier: "economy" },
          { label: "Outdoor Kitchen/BBQ", price: "$$", item: "Outdoor kitchen or BBQ island", qualityTier: "mid_range" },
          { label: "In-Ground Pool", price: "$$$", item: "In-ground swimming pool", qualityTier: "premium" },
        ],
      },
    ],
    defaultQuantities: () => ({
      outdoorFeature: { quantity: 1, unit: "each" },
    }),
  },
  driveway: {
    label: "Driveway & Walkways",
    category: "driveway",
    groups: [
      {
        label: "Material",
        key: "drivewayMaterial",
        options: [
          { label: "Gravel/Crushed Stone", price: "$", item: "Driveway (gravel/crushed stone)", qualityTier: "economy" },
          { label: "Asphalt", price: "$$", item: "Driveway (asphalt)", qualityTier: "mid_range" },
          { label: "Concrete or Pavers", price: "$$$", item: "Driveway (concrete or pavers)", qualityTier: "premium" },
        ],
      },
      {
        label: "Scope",
        key: "drivewayScope",
        options: [
          { label: "Walkway Only", price: "$", item: "Walkway installation", qualityTier: "economy" },
          { label: "Single Car Driveway", price: "$$", item: "Single car driveway", qualityTier: "mid_range" },
          { label: "Double Car or Extension", price: "$$$", item: "Double car driveway or extension", qualityTier: "premium" },
        ],
      },
    ],
    defaultQuantities: () => ({
      drivewayMaterial: { quantity: 600, unit: "sqft" },
      drivewayScope: { quantity: 1, unit: "each" },
    }),
  },
  accessibility: {
    label: "Accessibility & Aging-in-Place",
    category: "accessibility",
    groups: [
      {
        label: "Modification Type",
        key: "accessibilityType",
        options: [
          { label: "Grab Bars & Handrails", price: "$", item: "Grab bars and safety handrails", qualityTier: "economy" },
          { label: "Wheelchair Ramp", price: "$$", item: "Wheelchair ramp installation", qualityTier: "mid_range" },
          { label: "Stair Lift/Elevator", price: "$$$", item: "Stair lift or residential elevator", qualityTier: "premium" },
        ],
      },
      {
        label: "Bathroom Updates",
        key: "accessibleBath",
        options: [
          { label: "Walk-in Tub/Roll-in Shower", price: "$$$", item: "Walk-in tub or roll-in shower", qualityTier: "premium" },
        ],
      },
    ],
    defaultQuantities: () => ({
      accessibilityType: { quantity: 1, unit: "each" },
      accessibleBath: { quantity: 1, unit: "each" },
    }),
  },
};

export function computeSelectionHash(renovationType: string, selections: Record<string, string>): string {
  const sorted = Object.entries(selections).sort(([a], [b]) => a.localeCompare(b));
  const str = `${renovationType}:${sorted.map(([k, v]) => `${k}=${v}`).join(",")}`;
  return createHash("sha256").update(str).digest("hex").slice(0, 16);
}

export interface ConfiguratorQuoteResult {
  lineItems: Array<{
    category: string;
    description: string;
    materialCost: number;
    laborCost: number;
    quantity: number;
    unit: string;
    qualityTier: string;
  }>;
  totalMaterialCost: number;
  totalLaborCost: number;
  grandTotal: number;
  selectionHash: string;
  renovationType: string;
  selections: Record<string, string>;
  regionalMultiplier: number;
  metroArea: string;
}

export async function generateConfiguratorQuote(
  renovationType: string,
  selections: Record<string, string>,
  property: PropertyInfo,
  conversationId?: number
): Promise<ConfiguratorQuoteResult> {
  const config = CONFIGURATOR_MAP[renovationType];
  if (!config) {
    throw new Error(`Unknown renovation type: ${renovationType}`);
  }

  const quantities = config.defaultQuantities(property);
  const regional = await getRegionalMultiplier(property.zipCode);

  const invalidSelections: string[] = [];
  for (const group of config.groups) {
    const selectedLabel = selections[group.key];
    if (!selectedLabel) continue;
    const option = group.options.find(o => o.label === selectedLabel);
    if (!option) {
      invalidSelections.push(`${group.label}: "${selectedLabel}" is not a valid option`);
    }
  }
  const providedKeys = Object.keys(selections).filter(k => config.groups.some(g => g.key === k));
  if (providedKeys.length === 0) {
    throw new Error("At least one option group must be selected");
  }
  if (invalidSelections.length > 0) {
    throw new Error(`Invalid selections: ${invalidSelections.join("; ")}`);
  }

  const unknownKeys = Object.keys(selections).filter(k => !config.groups.some(g => g.key === k));
  if (unknownKeys.length > 0) {
    throw new Error(`Unknown selection keys: ${unknownKeys.join(", ")}`);
  }

  const selectionHash = computeSelectionHash(renovationType, selections);
  const cacheKey = `${conversationId ?? "no-conv"}:${selectionHash}`;
  const cached = configuratorQuoteCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const aiItems: Array<{ category: string; description: string; quantity: number; unit: string; qualityTierOverride: string }> = [];

  for (const group of config.groups) {
    const selectedLabel = selections[group.key];
    if (!selectedLabel) continue;
    const option = group.options.find(o => o.label === selectedLabel)!;
    const qty = quantities[group.key] || { quantity: 1, unit: "each" };

    aiItems.push({
      category: config.category,
      description: option.item,
      quantity: qty.quantity,
      unit: qty.unit,
      qualityTierOverride: option.qualityTier,
    });
  }

  const lineItems = await priceLineItemsFromCostEngine(
    aiItems,
    "mid_range",
    regional.factor,
    property.yearBuilt
  );

  const totalMaterialCost = lineItems.reduce((sum, li) => sum + li.materialCost * li.quantity, 0);
  const totalLaborCost = lineItems.reduce((sum, li) => sum + li.laborCost * li.quantity, 0);

  const result: ConfiguratorQuoteResult = {
    lineItems,
    totalMaterialCost: Math.round(totalMaterialCost),
    totalLaborCost: Math.round(totalLaborCost),
    grandTotal: Math.round(totalMaterialCost + totalLaborCost),
    selectionHash,
    renovationType,
    selections,
    regionalMultiplier: regional.factor,
    metroArea: regional.metroArea,
  };

  configuratorQuoteCache.set(cacheKey, result);
  return result;
}

const RENOVATION_PATTERNS: Array<{ type: string; keywords: string[]; strictKeywords: string[] }> = [
  {
    type: "kitchen",
    keywords: ["kitchen remodel", "remodel kitchen", "kitchen renovation", "renovate kitchen", "update kitchen", "redo kitchen", "new kitchen", "kitchen upgrade", "kitchen makeover", "kitchen cost", "cost kitchen", "kitchen counter", "kitchen cabinet", "upgrade countertop", "new countertop", "new cabinet"],
    strictKeywords: ["kitchen remodel", "remodel kitchen", "kitchen renovation", "renovate kitchen", "update kitchen", "redo kitchen", "kitchen upgrade", "kitchen makeover"],
  },
  {
    type: "bathroom",
    keywords: ["bathroom remodel", "remodel bathroom", "bathroom renovation", "renovate bathroom", "update bathroom", "redo bathroom", "new bathroom", "bathroom upgrade", "bath remodel", "bathroom makeover", "bathroom cost", "cost bathroom", "new vanity", "shower remodel", "tub replacement", "new toilet"],
    strictKeywords: ["bathroom remodel", "remodel bathroom", "bathroom renovation", "renovate bathroom", "update bathroom", "redo bathroom", "bathroom upgrade", "bath remodel", "bathroom makeover"],
  },
  {
    type: "flooring",
    keywords: ["new floor", "replace floor", "flooring", "hardwood floor", "new carpet", "replace carpet", "vinyl floor", "laminate floor", "redo floor", "lvp", "vinyl plank", "engineered hardwood"],
    strictKeywords: ["new floor", "replace floor", "flooring", "hardwood floor", "new carpet", "replace carpet", "redo floor"],
  },
  {
    type: "exteriorPaint",
    keywords: ["exterior paint", "paint outside", "outside paint", "paint exterior", "siding", "new siding", "vinyl siding", "replace siding", "house paint", "exterior stain"],
    strictKeywords: ["exterior paint", "paint exterior", "new siding", "replace siding", "siding replacement", "exterior painting"],
  },
  {
    type: "painting",
    keywords: ["paint ", "repaint", "new paint", "painting", "interior paint", "paint job", "fresh paint", "paint throughout", "fresh coat"],
    strictKeywords: ["interior paint", "paint job", "paint throughout", "repaint entire", "repaint all", "full repaint", "whole house paint"],
  },
  {
    type: "windows",
    keywords: ["replace window", "new window", "window replacement", "upgrade window", "window upgrade", "double pane", "energy efficient window"],
    strictKeywords: ["replace window", "new window", "window replacement", "upgrade window", "window upgrade"],
  },
  {
    type: "deck",
    keywords: ["deck", "patio", "new deck", "replace deck", "build deck", "deck remodel", "outdoor deck", "composite deck", "porch", "deck railing"],
    strictKeywords: ["new deck", "build deck", "replace deck", "deck remodel", "deck renovation", "new patio", "patio renovation"],
  },
  {
    type: "staircase",
    keywords: ["stair", "staircase", "stairway", "banister", "stair railing", "baluster", "newel", "stair tread", "stair reno", "stair remodel", "update stair", "modernize stair"],
    strictKeywords: ["staircase remodel", "staircase renovation", "update staircase", "redo staircase", "new staircase", "stair renovation", "stair remodel", "modernize stair"],
  },
  {
    type: "roof",
    keywords: ["roof", "roofing", "re-roof", "reroof", "new roof", "shingle", "roof replacement", "roof repair", "roof leak"],
    strictKeywords: ["new roof", "roof replacement", "replace roof", "re-roof", "reroof", "roofing project"],
  },
  {
    type: "hvac",
    keywords: ["hvac", "heating", "air conditioning", "furnace", "heat pump", "central air", "ac unit", "ductwork", "new ac", "replace furnace", "replace hvac"],
    strictKeywords: ["new hvac", "replace hvac", "hvac system", "new furnace", "replace furnace", "new ac unit", "replace ac", "hvac upgrade"],
  },
  {
    type: "garage",
    keywords: ["garage", "garage door", "garage floor", "garage renovation", "garage remodel", "new garage door", "epoxy floor", "garage conversion"],
    strictKeywords: ["garage renovation", "garage remodel", "new garage door", "garage door replacement", "garage floor"],
  },
  {
    type: "basement",
    keywords: ["basement", "finish basement", "basement remodel", "basement renovation", "unfinished basement", "basement conversion", "basement finishing"],
    strictKeywords: ["finish basement", "basement remodel", "basement renovation", "basement finishing", "basement conversion"],
  },
  {
    type: "windowShutters",
    keywords: ["shutter", "shutters", "window shutter", "window shutters", "exterior shutter", "replace shutter", "new shutter", "update shutter", "modernize shutter"],
    strictKeywords: ["new shutters", "replace shutters", "window shutters", "shutter replacement", "update shutters", "modernize shutters"],
  },
  {
    type: "exteriorDoors",
    keywords: ["front door", "entry door", "exterior door", "new door", "replace door", "door replacement", "rear door", "patio door", "french door", "sliding door", "back door", "upgrade door"],
    strictKeywords: ["new front door", "replace front door", "front door replacement", "new entry door", "exterior door replacement", "new patio door", "replace patio door", "door upgrade"],
  },
  {
    type: "landscaping",
    keywords: ["landscaping", "landscape", "lawn", "yard", "garden", "hardscape", "paver", "sod", "new lawn", "curb appeal", "outdoor space", "planting"],
    strictKeywords: ["landscaping project", "landscape renovation", "new landscaping", "landscape design", "hardscape project", "redo landscaping", "landscape remodel"],
  },
  {
    type: "interiorTrim",
    keywords: ["trim", "molding", "moulding", "crown molding", "baseboard", "wainscoting", "board and batten", "millwork", "shiplap"],
    strictKeywords: ["crown molding", "new baseboards", "wainscoting", "board and batten", "install trim", "replace trim", "new molding"],
  },
  {
    type: "interiorDoors",
    keywords: ["interior door", "bedroom door", "bathroom door", "closet door", "barn door", "pocket door", "french door interior"],
    strictKeywords: ["replace interior door", "new interior door", "interior door replacement", "install barn door", "new bedroom door"],
  },
  {
    type: "siding",
    keywords: ["siding", "vinyl siding", "fiber cement", "hardie", "stone veneer", "gutter", "downspout", "exterior cladding", "fascia", "soffit"],
    strictKeywords: ["new siding", "replace siding", "siding replacement", "vinyl siding", "fiber cement siding", "new gutters", "gutter replacement"],
  },
  {
    type: "deckPorch",
    keywords: ["porch", "sunroom", "screened porch", "three season room", "four season room", "patio cover", "covered patio"],
    strictKeywords: ["new porch", "screened porch", "build sunroom", "sunroom addition", "porch enclosure", "add sunroom"],
  },
  {
    type: "plumbingSystems",
    keywords: ["water heater", "tankless", "water softener", "filtration", "plumbing system", "repipe", "re-pipe", "hot water"],
    strictKeywords: ["new water heater", "replace water heater", "tankless water heater", "water softener", "whole home filtration", "repipe house"],
  },
  {
    type: "electricalSolar",
    keywords: ["electrical panel", "breaker box", "rewire", "solar panel", "solar system", "ev charger", "electric vehicle", "generator"],
    strictKeywords: ["electrical panel upgrade", "install solar", "solar panel", "ev charger", "whole home rewire", "generator install"],
  },
  {
    type: "lighting",
    keywords: ["light fixture", "chandelier", "recessed light", "ceiling fan", "pendant light", "smart home", "security system", "home automation"],
    strictKeywords: ["new light fixture", "install recessed", "replace chandelier", "smart home system", "security system install", "new ceiling fan"],
  },
  {
    type: "specialtyRooms",
    keywords: ["home office", "study room", "gym room", "workout room", "laundry room", "mudroom", "drop zone", "wine cellar", "home theater"],
    strictKeywords: ["build home office", "home office remodel", "laundry room remodel", "mudroom build", "home gym", "home theater", "wine cellar"],
  },
  {
    type: "basementAttic",
    keywords: ["attic conversion", "convert attic", "bonus room", "attic bedroom", "attic finishing"],
    strictKeywords: ["attic conversion", "convert attic", "finish attic", "attic bedroom", "attic remodel"],
  },
  {
    type: "closets",
    keywords: ["closet", "wardrobe", "pantry organiz", "storage system", "built in", "custom closet", "walk-in closet", "closet organiz"],
    strictKeywords: ["custom closet", "closet remodel", "closet organization", "new closet system", "walk-in closet", "closet build"],
  },
  {
    type: "fencing",
    keywords: ["fence", "fencing", "privacy fence", "chain link", "picket fence", "gate", "wood fence", "vinyl fence"],
    strictKeywords: ["new fence", "install fence", "replace fence", "fence replacement", "privacy fence", "fencing project"],
  },
  {
    type: "outdoorLiving",
    keywords: ["pool", "swimming pool", "outdoor kitchen", "fire pit", "pergola", "gazebo", "outdoor fireplace", "bbq island", "hot tub"],
    strictKeywords: ["install pool", "new pool", "outdoor kitchen", "build fire pit", "new pergola", "build gazebo", "hot tub install"],
  },
  {
    type: "driveway",
    keywords: ["driveway", "walkway", "concrete driveway", "asphalt driveway", "paving", "sidewalk", "pathway"],
    strictKeywords: ["new driveway", "replace driveway", "driveway replacement", "pave driveway", "new walkway", "concrete driveway"],
  },
  {
    type: "accessibility",
    keywords: ["accessibility", "aging in place", "grab bar", "wheelchair ramp", "stair lift", "elevator", "walk-in tub", "roll-in shower", "ada", "handicap"],
    strictKeywords: ["aging in place", "accessibility modification", "install grab bar", "wheelchair ramp", "stair lift", "walk-in tub"],
  },
];

export function detectRenovationIntent(message: string): string | null {
  const msg = message.toLowerCase().replace(/\b(the|a|an|my|our|this|that|master|guest|main|half)\b/g, " ").replace(/\s+/g, " ").trim();

  for (const pattern of RENOVATION_PATTERNS) {
    if (pattern.keywords.some(kw => msg.includes(kw))) {
      return pattern.type;
    }
  }

  return null;
}

const RECOMMENDATION_VERBS = ["recommend", "suggest", "start with", "focus on", "consider", "let's start", "begin with", "tackle", "prioritize", "biggest impact"];

function detectRenovationIntentStrict(message: string): string | null {
  const msg = message.toLowerCase().replace(/\b(the|a|an|my|our|this|that|master|guest|main|half)\b/g, " ").replace(/\s+/g, " ").trim();

  const hasRecommendationContext = RECOMMENDATION_VERBS.some(v => msg.includes(v));

  for (const pattern of RENOVATION_PATTERNS) {
    const strictMatch = pattern.strictKeywords.some(kw => msg.includes(kw));
    if (!strictMatch) continue;

    if (hasRecommendationContext) return pattern.type;

    const keywordHits = pattern.keywords.filter(kw => msg.includes(kw)).length;
    if (keywordHits >= 2) return pattern.type;
  }

  return null;
}

export function detectRenovationIntentFromBoth(userMessage: string, aiResponse: string): string | null {
  const userIntent = detectRenovationIntent(userMessage);
  if (userIntent) return userIntent;

  return detectRenovationIntentStrict(aiResponse);
}

export function getConfiguratorOptions(renovationType: string, conversationContext?: string) {
  const config = CONFIGURATOR_MAP[renovationType];
  if (!config) return null;

  const ctx = (conversationContext || "").toLowerCase();

  const filteredGroups = config.groups.filter((g) => {
    if (!g.contextKeywords || g.contextKeywords.length === 0) return true;
    if (!ctx) return true;
    return g.contextKeywords.some((kw) => ctx.includes(kw));
  });

  const groupsToShow = filteredGroups.length > 0 ? filteredGroups : config.groups;

  return {
    renovationType,
    label: config.label,
    groups: groupsToShow.map(g => ({
      label: g.label,
      key: g.key,
      options: g.options.map(o => ({
        label: o.label,
        price: o.price,
      })),
    })),
  };
}

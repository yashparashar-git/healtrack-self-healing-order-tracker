
// const express = require("express");
// const mongoose = require("mongoose");
// const Order = require("../models/Order");

// const router = express.Router();

// const simulations = new Map();

// const statuses = [
//   "Placed",
//   "Confirmed",
//   "Preparing",
//   "Out for Delivery",
//   "Delivered",
// ];


// const PICKUP = {
//   name: "Ajmer Delivery Hub",
//   latitude: 26.4499,
//   longitude: 74.6399,
// };

// const UPDATE_INTERVAL_MS = 3000;

// function validId(id) {
//   return mongoose.isValidObjectId(id);
// }
// const {
//   getRoadRouteWithHealing,
// } = require("../services/osrmService");

// function validCoordinates(latitude, longitude) {
//   return (
//     Number.isFinite(latitude) &&
//     Number.isFinite(longitude) &&
//     latitude >= -90 &&
//     latitude <= 90 &&
//     longitude >= -180 &&
//     longitude <= 180
//   );
// }

// // Convert an address into coordinates using Nominatim.
// async function searchLocations(query) {
//   const cleanedQuery = query.trim();

//   if (cleanedQuery.length < 3) {
//     return [];
//   }

//   const url = new URL("https://nominatim.openstreetmap.org/search");
//   url.searchParams.set("q", cleanedQuery);
//   url.searchParams.set("format", "jsonv2");
//   url.searchParams.set("limit", "5");
//   url.searchParams.set("countrycodes", "in");
//   url.searchParams.set("addressdetails", "1");

//   const response = await fetch(url, {
//     headers: {
//       "User-Agent": "HealTrackHackathon/1.0 (delivery-tracking-demo)",
//       Accept: "application/json",
//     },
//     signal: AbortSignal.timeout(10000),
//   });

//   if (!response.ok) {
//     throw new Error(`Location search failed with HTTP ${response.status}`);
//   }

//   const results = await response.json();

//   return results
//     .map((item) => ({
//       name: item.display_name,
//       latitude: Number(item.lat),
//       longitude: Number(item.lon),
//     }))
//     .filter((item) =>
//       validCoordinates(item.latitude, item.longitude)
//     );
// }

// async function geocodeAddress(address) {
//   const results = await searchLocations(address);

//   if (!results.length) {
//     throw new Error(
//       `Location not found: "${address}". Try adding the area, city, or state.`
//     );
//   }

//   return results[0];
// }


// // Get a road route from OSRM. Coordinates in OSRM URLs use longitude,latitude.

// async function getRoadRoute(pickup, destination) {
//   const route = await getRoadRouteWithHealing(
//     {
//       longitude: Number(pickup.longitude),
//       latitude: Number(pickup.latitude),
//     },
//     {
//       longitude: Number(destination.longitude),
//       latitude: Number(destination.latitude),
//     }
//   );

//   // Keep the existing frontend map payload lightweight.
//   const allCoordinates = route.coordinates;
//   const maxPoints = 40;
//   const totalPoints = Math.min(maxPoints, allCoordinates.length);
//   const coordinates = [];

//   for (let i = 0; i < totalPoints; i++) {
//     const index =
//       totalPoints === 1
//         ? 0
//         : Math.round(
//             (i * (allCoordinates.length - 1)) /
//               (totalPoints - 1)
//           );

//     const point = allCoordinates[index];

//     if (
//       coordinates.length === 0 ||
//       coordinates[coordinates.length - 1][0] !== point[0] ||
//       coordinates[coordinates.length - 1][1] !== point[1]
//     ) {
//       coordinates.push(point);
//     }
//   }

//   return {
//     coordinates,
//     distanceMeters: Math.round(route.distanceMeters),
//     durationSeconds: Math.round(route.durationSeconds),
//     source: route.source,
//     degraded: route.degraded,
//   };
// }

// //search
// router.get("/locations/search", async (req, res) => {
//   try {
//     const query = String(req.query.q || "").trim();

//     if (query.length < 3) {
//       return res.json({ success: true, locations: [] });
//     }

//     const locations = await searchLocations(query);

//     res.json({
//       success: true,
//       locations,
//     });
//   } catch (error) {
//     console.error("Location search:", error.message);

//     res.status(502).json({
//       success: false,
//       message: "Location search is temporarily unavailable. Please try again.",
//     });
//   }
// });


// function stopSimulation(orderId) {
//   const simulation = simulations.get(orderId);

//   if (simulation) {
//     clearInterval(simulation.timer);
//     simulations.delete(orderId);
//   }
// }

// // Create order, geocode destination and calculate route.
// router.post("/", async (req, res) => {
//   try {
//     const { customerName, deliveryAddress } = req.body;

//     if (
//       typeof customerName !== "string" ||
//       !customerName.trim() ||
//       typeof deliveryAddress !== "string" ||
//       !deliveryAddress.trim()
//     ) {
//       return res.status(400).json({
//         success: false,
//         message: "Customer name and full delivery address are required",
//       });
//     }

//     // Use a complete address for reliable geocoding.
//     let destination;
//     let route;

//     try {
     
//       // destination = await geocodeAddress(deliveryAddress.trim());
//      const { destinationLatitude, destinationLongitude } = req.body;

// if (
//   destinationLatitude !== undefined &&
//   destinationLongitude !== undefined
// ) {
//   const latitude = Number(destinationLatitude);
//   const longitude = Number(destinationLongitude);

//   if (!validCoordinates(latitude, longitude)) {
//     return res.status(400).json({
//       success: false,
//       message: "Selected destination coordinates are invalid",
//     });
//   }

//   destination = {
//     name: deliveryAddress.trim(),
//     latitude,
//     longitude,
//   };
// } else {
//   destination = await geocodeAddress(deliveryAddress.trim());
// }
//       route = await getRoadRoute(PICKUP, destination);
//     } catch (error) {
//       return res.status(502).json({
//         success: false,
//         message: error.message,
//         hint: "Try a specific address with city and state, for example: Ajmer Bus Stand, Ajmer, Rajasthan, India.",
//       });
//     }

//     const order = await Order.create({
//       orderNumber: `HT-${Date.now()}`,
//       customerName: customerName.trim(),
//       deliveryAddress: deliveryAddress.trim(),

//       pickupLocation: PICKUP,
//       destinationLocation: destination,

//       location: {
//         latitude: PICKUP.latitude,
//         longitude: PICKUP.longitude,
//         updatedAt: new Date(),
//       },

//       routeCoordinates: route.coordinates,
//       status: "Placed",
//     });

//     res.status(201).json({
//       success: true,
//       message: "Order created and road route calculated",
//       order,
//       routeSummary: {
//         distanceMeters: route.distanceMeters,
//         distanceKm: Number((route.distanceMeters / 1000).toFixed(2)),
//         estimatedDrivingMinutes: Math.ceil(route.durationSeconds / 60),
//         routePoints: route.coordinates.length,
//       },
//     });
//   } catch (error) {
//     console.error("Create order:", error.message);
//     res.status(500).json({
//       success: false,
//       message: "Could not create order",
//     });
//   }
// });

// // List orders.
// router.get("/", async (req, res) => {
//   try {
//     const orders = await Order.find().sort({ createdAt: -1 });
//     res.json({ success: true, count: orders.length, orders });
//   } catch (error) {
//     console.error("List orders:", error.message);
//     res.status(500).json({
//       success: false,
//       message: "Could not fetch orders",
//     });
//   }
// });

// // Get live tracking details.
// router.get("/tracking/:id", async (req, res) => {
//   try {
//     if (!validId(req.params.id)) {
//       return res.status(400).json({
//         success: false,
//         message: "Invalid order ID",
//       });
//     }

//     const order = await Order.findById(req.params.id);

//     if (!order) {
//       return res.status(404).json({
//         success: false,
//         message: "Order not found",
//       });
//     }

//     const locationTime = new Date(order.location.updatedAt).getTime();

//     res.json({
//       success: true,
//       orderNumber: order.orderNumber,
//       customerName: order.customerName,
//       deliveryAddress: order.deliveryAddress,
//       status: order.status,

//       pickupLocation: order.pickupLocation,
//       destinationLocation: order.destinationLocation,
//       location: order.location,

//       routeCoordinates: order.routeCoordinates || [],
//       routeProgress: order.routeProgress || 0,

//       locationAgeSeconds: Number.isFinite(locationTime)
//         ? Math.max(0, Math.floor((Date.now() - locationTime) / 1000))
//         : null,

//       simulationRunning: simulations.has(req.params.id),
//     });
//   } catch (error) {
//     console.error("Get tracking:", error.message);
//     res.status(500).json({
//       success: false,
//       message: "Could not fetch tracking",
//     });
//   }
// });

// // Manually update rider location.
// router.patch("/:id/location", async (req, res) => {
//   try {
//     if (!validId(req.params.id)) {
//       return res.status(400).json({
//         success: false,
//         message: "Invalid order ID",
//       });
//     }

//     const { latitude, longitude } = req.body;

//     if (!validCoordinates(latitude, longitude)) {
//       return res.status(400).json({
//         success: false,
//         message: "Valid numeric latitude and longitude are required",
//       });
//     }

//     const order = await Order.findById(req.params.id);

//     if (!order) {
//       return res.status(404).json({
//         success: false,
//         message: "Order not found",
//       });
//     }

//     order.location.latitude = latitude;
//     order.location.longitude = longitude;
//     order.location.updatedAt = new Date();

//     await order.save();

//     res.json({
//       success: true,
//       message: "Location updated",
//       location: order.location,
//     });
//   } catch (error) {
//     console.error("Update location:", error.message);
//     res.status(500).json({
//       success: false,
//       message: "Could not update location",
//     });
//   }
// });

// // Manually advance only one status at a time.
// router.patch("/:id/status", async (req, res) => {
//   try {
//     if (!validId(req.params.id)) {
//       return res.status(400).json({
//         success: false,
//         message: "Invalid order ID",
//       });
//     }

//     const { status } = req.body;

//     if (!statuses.includes(status)) {
//       return res.status(400).json({
//         success: false,
//         message: "Invalid status",
//         allowedStatuses: statuses,
//       });
//     }

//     const order = await Order.findById(req.params.id);

//     if (!order) {
//       return res.status(404).json({
//         success: false,
//         message: "Order not found",
//       });
//     }

//     const currentIndex = statuses.indexOf(order.status);
//     const nextIndex = statuses.indexOf(status);

//     if (nextIndex !== currentIndex + 1) {
//       return res.status(400).json({
//         success: false,
//         message: "Move only to the next status in sequence",
//         currentStatus: order.status,
//         nextAllowedStatus: statuses[currentIndex + 1] || null,
//       });
//     }

//     order.status = status;
//     await order.save();

//     res.json({
//       success: true,
//       message: "Order status updated",
//       order,
//     });
//   } catch (error) {
//     console.error("Update status:", error.message);
//     res.status(500).json({
//       success: false,
//       message: "Could not update status",
//     });
//   }
// });

// // Start route-based simulation.
// router.post("/:id/simulate/start", async (req, res) => {
//   try {
//     const orderId = req.params.id;

//     if (!validId(orderId)) {
//       return res.status(400).json({
//         success: false,
//         message: "Invalid order ID",
//       });
//     }

//     const order = await Order.findById(orderId);

//     if (!order) {
//       return res.status(404).json({
//         success: false,
//         message: "Order not found",
//       });
//     }

//     if (order.status === "Delivered") {
//       return res.status(400).json({
//         success: false,
//         message: "Order is already delivered",
//       });
//     }

//     if (!order.routeCoordinates || order.routeCoordinates.length < 2) {
//       return res.status(400).json({
//         success: false,
//         message: "This order has no calculated road route. Create it again with a valid destination address.",
//       });
//     }

//     if (simulations.has(orderId)) {
//       return res.json({
//         success: true,
//         message: "Simulation is already running",
//       });
//     }

//     // Start at the pickup point.
//     order.location.latitude = order.pickupLocation.latitude;
//     order.location.longitude = order.pickupLocation.longitude;
//     order.location.updatedAt = new Date();
//     order.routeProgress = 0;
//     await order.save();

//     let routeIndex = 0;

//     const timer = setInterval(async () => {
//       try {
//         const currentOrder = await Order.findById(orderId);

//         if (!currentOrder || currentOrder.status === "Delivered") {
//           stopSimulation(orderId);
//           return;
//         }

//         // Progress the order through the workflow automatically.
//         const statusIndex = statuses.indexOf(currentOrder.status);
//         const outForDeliveryIndex = statuses.indexOf("Out for Delivery");

//         if (statusIndex < outForDeliveryIndex) {
//           currentOrder.status = statuses[statusIndex + 1];
//           await currentOrder.save();
//           return;
//         }

//         // Advance along the actual calculated road geometry.
//         const nextIndex = Math.min(
//           routeIndex + 1,
//           currentOrder.routeCoordinates.length - 1
//         );

//         routeIndex = nextIndex;

//         const [longitude, latitude] =
//           currentOrder.routeCoordinates[routeIndex];

//         if (!validCoordinates(latitude, longitude)) {
//           console.error("Invalid route coordinate; stopping simulation");
//           stopSimulation(orderId);
//           return;
//         }

//         currentOrder.location.latitude = latitude;
//         currentOrder.location.longitude = longitude;
//         currentOrder.location.updatedAt = new Date();
//         currentOrder.routeProgress = routeIndex;

//         const reachedDestination =
//           routeIndex >= currentOrder.routeCoordinates.length - 1;

//         if (reachedDestination) {
//           currentOrder.location.latitude =
//             currentOrder.destinationLocation.latitude;
//           currentOrder.location.longitude =
//             currentOrder.destinationLocation.longitude;
//           currentOrder.status = "Delivered";
//         }

//         await currentOrder.save();

//         if (reachedDestination) {
//           stopSimulation(orderId);
//           console.log(`Order ${currentOrder.orderNumber} delivered`);
//         }
//       } catch (error) {
//         console.error("Simulation update failed:", error.message);
//       }
//     }, UPDATE_INTERVAL_MS);

//     simulations.set(orderId, { timer });

//     res.json({
//       success: true,
//       message: "Route-based rider simulation started",
//       orderId,
//       updateIntervalSeconds: UPDATE_INTERVAL_MS / 1000,
//     });
//   } catch (error) {
//     console.error("Start simulation:", error.message);
//     res.status(500).json({
//       success: false,
//       message: "Could not start simulation",
//     });
//   }
// });

// // Stop simulated movement.
// router.post("/:id/simulate/stop", (req, res) => {
//   if (!validId(req.params.id)) {
//     return res.status(400).json({
//       success: false,
//       message: "Invalid order ID",
//     });
//   }

//   stopSimulation(req.params.id);

//   res.json({
//     success: true,
//     message: "Simulation stopped",
//   });
// });

// // Get one order by ID.
// router.get("/:id", async (req, res) => {
//   try {
//     if (!validId(req.params.id)) {
//       return res.status(400).json({
//         success: false,
//         message: "Invalid order ID",
//       });
//     }

//     const order = await Order.findById(req.params.id);

//     if (!order) {
//       return res.status(404).json({
//         success: false,
//         message: "Order not found",
//       });
//     }

//     res.json({ success: true, order });
//   } catch (error) {
//     console.error("Get order:", error.message);
//     res.status(500).json({
//       success: false,
//       message: "Could not fetch order",
//     });
//   }
// });

// module.exports = router;

const express = require("express");
const mongoose = require("mongoose");
const Order = require("../models/Order");
const { getRoadRouteWithHealing } = require("../services/osrmService");
const sim = require("../services/riderSimulation");
const tracking = require("../services/trackingHealer");

const router = express.Router();

const statuses = [
  "Placed",
  "Confirmed",
  "Preparing",
  "Out for Delivery",
  "Delivered",
];

const PICKUP = {
  name: "Ajmer Delivery Hub",
  latitude: 26.4499,
  longitude: 74.6399,
};

const MAX_ROUTE_POINTS = 40;

function validId(id) {
  return mongoose.isValidObjectId(id);
}

function validCoordinates(latitude, longitude) {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

function getRouteReliability(route) {
  return {
    source: route.source || "unknown",
    degraded: Boolean(route.degraded),
    attempts: Number(route.attempts) || 0,
    recoveryTimeMs: Number(route.recoveryTimeMs) || 0,
    lastCheckedAt: new Date(),
  };
}

function getStoredReliability(order) {
  return order.routeReliability || {
    source: "unknown",
    degraded: false,
    attempts: 0,
    recoveryTimeMs: 0,
    lastCheckedAt: null,
  };
}

function sampleCoordinates(allCoordinates) {
  if (!Array.isArray(allCoordinates) || allCoordinates.length < 2) {
    throw new Error("Routing service returned invalid route coordinates");
  }

  const totalPoints = Math.min(MAX_ROUTE_POINTS, allCoordinates.length);
  const coordinates = [];

  for (let i = 0; i < totalPoints; i++) {
    const index = Math.round(
      (i * (allCoordinates.length - 1)) / (totalPoints - 1)
    );

    const point = allCoordinates[index];

    if (
      !Array.isArray(point) ||
      point.length < 2 ||
      !validCoordinates(Number(point[1]), Number(point[0]))
    ) {
      throw new Error("Routing service returned an invalid coordinate");
    }

    const normalizedPoint = [Number(point[0]), Number(point[1])];
    const previous = coordinates[coordinates.length - 1];

    if (
      !previous ||
      previous[0] !== normalizedPoint[0] ||
      previous[1] !== normalizedPoint[1]
    ) {
      coordinates.push(normalizedPoint);
    }
  }

  if (coordinates.length < 2) {
    throw new Error("Route must contain at least two distinct points");
  }

  return coordinates;
}

// Search for delivery locations using OpenStreetMap Nominatim.
async function searchLocations(query) {
  const cleanedQuery = String(query || "").trim();

  if (cleanedQuery.length < 3) {
    return [];
  }

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", cleanedQuery);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "5");
  url.searchParams.set("countrycodes", "in");
  url.searchParams.set("addressdetails", "1");

  const response = await fetch(url, {
    headers: {
      "User-Agent": "HealTrackHackathon/1.0 (delivery-tracking-demo)",
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    throw new Error(`Location search failed with HTTP ${response.status}`);
  }

  const results = await response.json();

  return results
    .map((item) => ({
      name: item.display_name,
      latitude: Number(item.lat),
      longitude: Number(item.lon),
    }))
    .filter((item) =>
      validCoordinates(item.latitude, item.longitude)
    );
}

async function geocodeAddress(address) {
  const results = await searchLocations(address);

  if (!results.length) {
    const error = new Error(
      `Location not found: "${address}". Try adding the area, city, or state.`
    );

    error.statusCode = 400;
    throw error;
  }

  return results[0];
}

// Fetch a live road route or a cached fallback from the self-healing service.
async function getRoadRoute(pickup, destination) {
  const route = await getRoadRouteWithHealing(
    {
      longitude: Number(pickup.longitude),
      latitude: Number(pickup.latitude),
    },
    {
      longitude: Number(destination.longitude),
      latitude: Number(destination.latitude),
    }
  );

  const coordinates = sampleCoordinates(route.coordinates);

  if (
    !Number.isFinite(route.distanceMeters) ||
    route.distanceMeters < 0 ||
    !Number.isFinite(route.durationSeconds) ||
    route.durationSeconds < 0
  ) {
    throw new Error("Routing service returned invalid distance or duration");
  }

  return {
    coordinates,
    distanceMeters: Math.round(route.distanceMeters),
    durationSeconds: Math.round(route.durationSeconds),
    source: route.source || "unknown",
    degraded: Boolean(route.degraded),
    attempts: Number(route.attempts) || 0,
    recoveryTimeMs: Number(route.recoveryTimeMs) || 0,
    message: route.message || "",
    circuit: route.circuit || null,
  };
}

// Search delivery locations.
router.get("/locations/search", async (req, res) => {
  try {
    const query = String(req.query.q || "").trim();

    if (query.length < 3) {
      return res.json({
        success: true,
        locations: [],
      });
    }

    const locations = await searchLocations(query);

    return res.json({
      success: true,
      locations,
    });
  } catch (error) {
    console.error("Location search:", error.message);

    return res.status(502).json({
      success: false,
      message: "Location search is temporarily unavailable. Please try again.",
    });
  }
});

// Create an order and calculate its road route.
router.post("/", async (req, res) => {
  try {
    const { customerName, deliveryAddress } = req.body || {};

    if (
      typeof customerName !== "string" ||
      !customerName.trim() ||
      typeof deliveryAddress !== "string" ||
      !deliveryAddress.trim()
    ) {
      return res.status(400).json({
        success: false,
        message: "Customer name and full delivery address are required",
      });
    }

    const { destinationLatitude, destinationLongitude } = req.body;

    let destination;
    let route;

    try {
      const hasLatitude = destinationLatitude !== undefined;
      const hasLongitude = destinationLongitude !== undefined;

      if (hasLatitude !== hasLongitude) {
        return res.status(400).json({
          success: false,
          message: "Both destination latitude and longitude are required",
        });
      }

      if (hasLatitude && hasLongitude) {
        const latitude = Number(destinationLatitude);
        const longitude = Number(destinationLongitude);

        if (
          destinationLatitude === null ||
          destinationLongitude === null ||
          destinationLatitude === "" ||
          destinationLongitude === "" ||
          !validCoordinates(latitude, longitude)
        ) {
          return res.status(400).json({
            success: false,
            message: "Selected destination coordinates are invalid",
          });
        }

        destination = {
          name: deliveryAddress.trim(),
          latitude,
          longitude,
        };
      } else {
        destination = await geocodeAddress(deliveryAddress.trim());
      }

      route = await getRoadRoute(PICKUP, destination);
    } catch (error) {
      console.error("Create order routing:", error.message);

      return res.status(error.statusCode || 502).json({
        success: false,
        message: error.message || "Unable to calculate a delivery route",
        hint:
          error.statusCode === 400
            ? "Check the delivery address or selected map coordinates."
            : "Routing may be unavailable. Try again after the service recovers.",
        reliability: error.reliability || null,
        attempts: error.attempts || 0,
      });
    }

    const order = await Order.create({
      orderNumber: `HT-${new mongoose.Types.ObjectId().toString()}`,
      customerName: customerName.trim(),
      deliveryAddress: deliveryAddress.trim(),
      pickupLocation: PICKUP,
      destinationLocation: destination,
      location: {
        latitude: PICKUP.latitude,
        longitude: PICKUP.longitude,
        updatedAt: new Date(),
      },
      routeCoordinates: route.coordinates,
      routeProgress: 0,
      routeReliability: getRouteReliability(route),
      status: "Placed",
    });

    return res.status(201).json({
      success: true,
      message: "Order created and road route calculated",
      order,
      routeSummary: {
        distanceMeters: route.distanceMeters,
        distanceKm: Number((route.distanceMeters / 1000).toFixed(2)),
        estimatedDrivingMinutes: Math.ceil(route.durationSeconds / 60),
        routePoints: route.coordinates.length,
        source: route.source,
        degraded: route.degraded,
        attempts: route.attempts,
        recoveryTimeMs: route.recoveryTimeMs,
        message: route.message,
        circuit: route.circuit,
      },
    });
  } catch (error) {
    console.error("Create order:", error.message);

    return res.status(500).json({
      success: false,
      message: "Could not create order",
    });
  }
});

// List orders.
router.get("/", async (req, res) => {
  try {
    const orders = await Order.find().sort({ createdAt: -1 });

    return res.json({
      success: true,
      count: orders.length,
      orders,
    });
  } catch (error) {
    console.error("List orders:", error.message);

    return res.status(500).json({
      success: false,
      message: "Could not fetch orders",
    });
  }
});

// Get live tracking details.
router.get("/tracking/:id", async (req, res) => {
  try {
    if (!validId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid order ID",
      });
    }

    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    const locationTime = new Date(order.location.updatedAt).getTime();
    const trackingState = await tracking.getTrackingState(order);

    return res.json({
      success: true,
      orderNumber: order.orderNumber,
      customerName: order.customerName,
      deliveryAddress: order.deliveryAddress,
      status: order.status,
      pickupLocation: order.pickupLocation,
      destinationLocation: order.destinationLocation,
      location: order.location,
      routeCoordinates: order.routeCoordinates || [],
      routeProgress: order.routeProgress || 0,
      routeReliability: getStoredReliability(order),
      locationAgeSeconds: Number.isFinite(locationTime)
        ? Math.max(0, Math.floor((Date.now() - locationTime) / 1000))
        : null,
      simulationRunning: sim.isRunning(req.params.id),
      tracking: trackingState,
    });
  } catch (error) {
    console.error("Get tracking:", error.message);

    return res.status(500).json({
      success: false,
      message: "Could not fetch tracking",
    });
  }
});

// Manually update rider location.
router.patch("/:id/location", async (req, res) => {
  try {
    if (!validId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid order ID",
      });
    }

    const order = await tracking.applyLocationUpdate(req.params.id, req.body);

    return res.json({
      success: true,
      message: "Location updated",
      location: order.location,
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
        incidentId: error.incidentId || null,
      });
    }

    console.error("Update location:", error.message);

    return res.status(500).json({
      success: false,
      message: "Could not update location",
    });
  }
});

// Advance one delivery status at a time.
router.patch("/:id/status", async (req, res) => {
  try {
    if (!validId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid order ID",
      });
    }

    const { status } = req.body || {};

    if (!statuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status",
        allowedStatuses: statuses,
      });
    }

    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    const currentIndex = statuses.indexOf(order.status);
    const nextIndex = statuses.indexOf(status);

    if (nextIndex !== currentIndex + 1) {
      return res.status(400).json({
        success: false,
        message: "Move only to the next status in sequence",
        currentStatus: order.status,
        nextAllowedStatus: statuses[currentIndex + 1] || null,
      });
    }

    order.status = status;
    await order.save();

    return res.json({
      success: true,
      message: "Order status updated",
      order,
    });
  } catch (error) {
    console.error("Update status:", error.message);

    return res.status(500).json({
      success: false,
      message: "Could not update status",
    });
  }
});

// Start route-based rider simulation.
router.post("/:id/simulate/start", async (req, res) => {
  try {
    const orderId = req.params.id;

    if (!validId(orderId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid order ID",
      });
    }

    const result = await sim.startSimulation(orderId, { reset: true });

    if (result.alreadyRunning) {
      return res.json({
        success: true,
        message: "Simulation is already running",
      });
    }

    return res.json({
      success: true,
      message: "Route-based rider simulation started",
      orderId,
      updateIntervalSeconds: sim.UPDATE_INTERVAL_MS / 1000,
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }

    console.error("Start simulation:", error.message);

    return res.status(500).json({
      success: false,
      message: "Could not start simulation",
    });
  }
});

// Stop simulated movement.
router.post("/:id/simulate/stop", async (req, res) => {
  if (!validId(req.params.id)) {
    return res.status(400).json({
      success: false,
      message: "Invalid order ID",
    });
  }

  try {
    await sim.stopSimulation(req.params.id);

    return res.json({
      success: true,
      message: "Simulation stopped",
    });
  } catch (error) {
    console.error("Stop simulation:", error.message);

    return res.status(500).json({
      success: false,
      message: "Could not stop simulation",
    });
  }
});

// Get one order by ID.
router.get("/:id", async (req, res) => {
  try {
    if (!validId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid order ID",
      });
    }

    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    return res.json({
      success: true,
      order,
    });
  } catch (error) {
    console.error("Get order:", error.message);

    return res.status(500).json({
      success: false,
      message: "Could not fetch order",
    });
  }
});

module.exports = router;


// remaing work
// router.post("/:id/simulate/start", async (req, res) => {
//   try {
//     const orderId = req.params.id;

//     if (!validId(orderId)) {
//       return res.status(400).json({
//         success: false,
//         message: "Invalid order ID",
//       });
//     }

//     const result = await sim.startSimulation(orderId, { reset: true });

//     if (result.alreadyRunning) {
//       return res.json({
//         success: true,
//         message: "Simulation is already running",
//       });
//     }

//     return res.json({
//       success: true,
//       message: "Route-based rider simulation started",
//       orderId,
//       updateIntervalSeconds: sim.UPDATE_INTERVAL_MS / 1000,
//     });
//   } catch (error) {
//     if (error.statusCode) {
//       return res.status(error.statusCode).json({
//         success: false,
//         message: error.message,
//       });
//     }

//     console.error("Start simulation:", error.message);

//     return res.status(500).json({
//       success: false,
//       message: "Could not start simulation",
//     });
//   }
// });

// // Stop simulated movement.
// router.post("/:id/simulate/stop", async (req, res) => {
//   if (!validId(req.params.id)) {
//     return res.status(400).json({
//       success: false,
//       message: "Invalid order ID",
//     });
//   }

//   try {
//     await sim.stopSimulation(req.params.id);

//     return res.json({
//       success: true,
//       message: "Simulation stopped",
//     });
//   } catch (error) {
//     console.error("Stop simulation:", error.message);

//     return res.status(500).json({
//       success: false,
//       message: "Could not stop simulation",
//     });
//   }
// });

// // Get one order by ID.
// router.get("/:id", async (req, res) => {
//   try {
//     if (!validId(req.params.id)) {
//       return res.status(400).json({
//         success: false,
//         message: "Invalid order ID",
//       });
//     }

//     const order = await Order.findById(req.params.id);

//     if (!order) {
//       return res.status(404).json({
//         success: false,
//         message: "Order not found",
//       });
//     }

//     return res.json({
//       success: true,
//       order,
//     });
//   } catch (error) {
//     console.error("Get order:", error.message);

//     return res.status(500).json({
//       success: false,
//       message: "Could not fetch order",
//     });
//   }
// });

// module.exports = router;


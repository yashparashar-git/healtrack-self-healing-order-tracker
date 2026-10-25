// const mongoose = require("mongoose");

// const coordinatesSchema = new mongoose.Schema(
//   {
//     name: {
//       type: String,
//       trim: true,
//       default: "",
//     },
//     latitude: {
//       type: Number,
//       default: null,
//     },
//     longitude: {
//       type: Number,
//       default: null,
//     },
//   },
//   { _id: false }
// );

// const orderSchema = new mongoose.Schema(
//   {
//     orderNumber: {
//       type: String,
//       required: true,
//       unique: true,
//     },

//     customerName: {
//       type: String,
//       required: true,
//       trim: true,
//     },

//     deliveryAddress: {
//       type: String,
//       required: true,
//       trim: true,
//     },

//     pickupLocation: {
//       type: coordinatesSchema,
//       default: () => ({
//         name: "Ajmer Delivery Hub",
//         latitude: 26.4499,
//         longitude: 74.6399,
//       }),
//     },

//     destinationLocation: {
//       type: coordinatesSchema,
//       default: () => ({
//         name: "",
//         latitude: null,
//         longitude: null,
//       }),
//     },

//     location: {
//       latitude: {
//         type: Number,
//         default: 26.4499,
//       },
//       longitude: {
//         type: Number,
//         default: 74.6399,
//       },
//       updatedAt: {
//         type: Date,
//         default: Date.now,
//       },
//     },

//     routeCoordinates: {
//       type: [[Number]],
//       default: [],
//     },

//     routeProgress: {
//       type: Number,
//       default: 0,
//       min: 0,
//     },

//     status: {
//       type: String,
//       enum: [
//         "Placed",
//         "Confirmed",
//         "Preparing",
//         "Out for Delivery",
//         "Delivered",
//       ],
//       default: "Placed",
//     },
//   },
//   {
//     timestamps: true,
//   }
// );

// module.exports = mongoose.model("Order", orderSchema);

const mongoose = require("mongoose");

const coordinatesSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      trim: true,
      default: "",
    },
    latitude: {
      type: Number,
      default: null,
    },
    longitude: {
      type: Number,
      default: null,
    },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    orderNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    customerName: {
      type: String,
      required: true,
      trim: true,
    },

    deliveryAddress: {
      type: String,
      required: true,
      trim: true,
    },

    pickupLocation: {
      type: coordinatesSchema,
      default: () => ({
        name: "Ajmer Delivery Hub",
        latitude: 26.4499,
        longitude: 74.6399,
      }),
    },

    destinationLocation: {
      type: coordinatesSchema,
      default: () => ({
        name: "",
        latitude: null,
        longitude: null,
      }),
    },

    location: {
      latitude: {
        type: Number,
        default: 26.4499,
      },
      longitude: {
        type: Number,
        default: 74.6399,
      },
      updatedAt: {
        type: Date,
        default: Date.now,
      },
    },

    routeCoordinates: {
      type: [[Number]],
      default: [],
    },

    routeProgress: {
      type: Number,
      default: 0,
      min: 0,
    },

    routeReliability: {
      source: {
        type: String,
        enum: ["osrm", "cache", "unknown"],
        default: "unknown",
      },
      degraded: {
        type: Boolean,
        default: false,
      },
      attempts: {
        type: Number,
        default: 0,
        min: 0,
      },
      recoveryTimeMs: {
        type: Number,
        default: 0,
        min: 0,
      },
      lastCheckedAt: {
        type: Date,
        default: null,
      },
    },

    status: {
      type: String,
      enum: [
        "Placed",
        "Confirmed",
        "Preparing",
        "Out for Delivery",
        "Delivered",
      ],
      default: "Placed",
    },

    // Tracking health. lastSuccessfulLocationAt is only set when a validated
    // location was actually persisted, so a stale location is never "live".
    tracking: {
      simulationActive: {
        type: Boolean,
        default: false,
      },
      lastSuccessfulLocationAt: {
        type: Date,
        default: null,
      },
      lastError: {
        type: String,
        default: null,
      },
      lastErrorAt: {
        type: Date,
        default: null,
      },
      consecutiveFailures: {
        type: Number,
        default: 0,
        min: 0,
      },
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Order", orderSchema);

  import { useEffect } from "react";
  import L from "leaflet";
  import {
    MapContainer,
    TileLayer,
    Marker,
    Popup,
    Polyline,
    useMap,
  } from "react-leaflet";
  import "leaflet/dist/leaflet.css";

  const riderIcon = L.icon({
    iconUrl:
      "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
    iconRetinaUrl:
      "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
    shadowUrl:
      "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
  });

  const pickupIcon = L.divIcon({
    className: "healtrack-map-icon",
    html: '<div style="background:#48e0d0;color:#07111d;width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:3px solid white;font-weight:800;box-shadow:0 2px 12px #0005">P</div>',
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });

  const destinationIcon = L.divIcon({
    className: "healtrack-map-icon",
    html: '<div style="background:#5c8dff;color:white;width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:3px solid white;font-weight:800;box-shadow:0 2px 12px #0005">D</div>',
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });

  function FollowRider({ position }) {
    const map = useMap();

    useEffect(() => {
      if (position) {
        map.panTo(position, { animate: true, duration: 0.6 });
      }
    }, [position, map]);

    return null;
  }

  function FitRoute({ routePositions, pickupPosition, destinationPosition }) {
    const map = useMap();

    useEffect(() => {
      const points = [
        ...(routePositions || []),
        ...(pickupPosition ? [pickupPosition] : []),
        ...(destinationPosition ? [destinationPosition] : []),
      ];

      if (points.length > 1) {
        map.fitBounds(L.latLngBounds(points), {
          padding: [35, 35],
          maxZoom: 15,
        });
      } else if (points.length === 1) {
        map.setView(points[0], 15);
      }
    }, [map, routePositions, pickupPosition, destinationPosition]);

    return null;
  }

  export default function DeliveryMap({
    location,
    pickupLocation,
    destinationLocation,
    routeCoordinates = [],
  }) {
    const latitude = Number(location?.latitude);
    const longitude = Number(location?.longitude);

    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      return <p>Waiting for valid rider coordinates...</p>;
    }

    const riderPosition = [latitude, longitude];

    const pickupLat = Number(pickupLocation?.latitude);
    const pickupLng = Number(pickupLocation?.longitude);

    const destinationLat = Number(destinationLocation?.latitude);
    const destinationLng = Number(destinationLocation?.longitude);

    const validPickup =
      Number.isFinite(pickupLat) &&
      Number.isFinite(pickupLng) &&
      pickupLocation?.latitude != null &&
      pickupLocation?.longitude != null;

    const validDestination =
      Number.isFinite(destinationLat) &&
      Number.isFinite(destinationLng) &&
      destinationLocation?.latitude != null &&
      destinationLocation?.longitude != null;

    // Backend stores route coordinates as [longitude, latitude].
    // Leaflet expects [latitude, longitude].
    const routePositions = routeCoordinates
      .filter(
        (point) =>
          Array.isArray(point) &&
          point.length >= 2 &&
          Number.isFinite(Number(point[0])) &&
          Number.isFinite(Number(point[1]))
      )
      .map(([lng, lat]) => [Number(lat), Number(lng)]);

    const pickupPosition = validPickup ? [pickupLat, pickupLng] : null;
    const destinationPosition = validDestination
      ? [destinationLat, destinationLng]
      : null;

    return (
      <div style={{ position: "relative" }}>
        <MapContainer
          center={riderPosition}
          zoom={14}
          scrollWheelZoom
          style={{
            height: "400px",
            width: "100%",
            borderRadius: "14px",
            background: "#e8edf2",
          }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <FollowRider position={riderPosition} />

          <FitRoute
            routePositions={routePositions}
            pickupPosition={pickupPosition}
            destinationPosition={destinationPosition}
          />

          {routePositions.length > 1 && (
            <Polyline
              positions={routePositions}
              pathOptions={{
                color: "#3478f6",
                weight: 5,
                opacity: 0.9,
              }}
            />
          )}

          {pickupPosition && (
            <Marker position={pickupPosition} icon={pickupIcon}>
              <Popup>
                <strong>Pickup Hub</strong>
                <br />
                {pickupLocation.name || "Starting point"}
              </Popup>
            </Marker>
          )}

          {destinationPosition && (
            <Marker position={destinationPosition} icon={destinationIcon}>
              <Popup>
                <strong>Delivery Destination</strong>
                <br />
                {destinationLocation.name || "Destination"}
              </Popup>
            </Marker>
          )}

          <Marker position={riderPosition} icon={riderIcon}>
            <Popup>
              <strong>HealTrack Rider</strong>
              <br />
              Live simulated delivery location
            </Popup>
          </Marker>
        </MapContainer>

        <div
          style={{
            position: "absolute",
            zIndex: 500,
            left: 12,
            bottom: 12,
            display: "flex",
            gap: 12,
            flexWrap: "wrap",
            padding: "9px 12px",
            borderRadius: 9,
            background: "rgba(10, 19, 33, 0.92)",
            color: "#edf3ff",
            fontSize: 11,
            pointerEvents: "none",
          }}
        >
          <span>● Pickup</span>
          <span style={{ color: "#86adff" }}>● Destination</span>
          <span>— Road route</span>
        </div>
      </div>
    );
  }
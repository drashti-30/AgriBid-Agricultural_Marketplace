# AgriBid API Documentation

Base URL: `http://localhost:3000`

## Health

`GET /api/health`

Returns server status and timestamp.

## Crops

`GET /api/crops`

Returns the crop catalogue from `data/crops.json`.

## Farmers

`GET /api/farmers`

Returns farmer records.

`PATCH /api/farmers/:id/verification`

Body:

```json
{ "verified": true }
```

## Auctions

`GET /api/auctions`

Returns auctions with crop/farmer information and automatic status synchronization.

`POST /api/auctions`

Example body:

```json
{
  "cropName": "Wheat",
  "farmerName": "Rajesh Patel",
  "category": "Grains",
  "quantity": 500,
  "basePrice": 20,
  "minimumIncrement": 1,
  "startTime": "2026-09-12T10:00:00.000Z",
  "endTime": "2026-09-15T16:30:00.000Z",
  "latitude": "22.3072",
  "longitude": "73.1812"
}
```

`PATCH /api/auctions/:id`

Updates auction details using the same fields as create.

`PATCH /api/auctions/:id/status`

Body:

```json
{ "status": "Closed" }
```

`DELETE /api/auctions/:id`

Deletes an auction.

## Bids

`GET /api/bids`

Returns all bids.

`GET /api/bids?auctionId=1`

Returns bids for one auction.

`POST /api/bids`

Body:

```json
{
  "auctionId": 1,
  "buyerName": "Fresh Foods Pvt Ltd",
  "amount": 30
}
```

The server verifies that the auction is active and that the bid reaches the minimum allowed amount.

## Notifications

`GET /api/notifications?role=Buyer&userName=Fresh%20Foods%20Pvt%20Ltd`

Returns role-aware notifications.

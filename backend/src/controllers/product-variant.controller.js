import * as variantService from "../services/product-variant.service.js";

export async function listPublicVariants(request, response) {
  response.status(200).json({
    ...await variantService.listPublicVariants(request.params.productId, request.query)
  });
}

export async function getPublicVariant(request, response) {
  response.status(200).json({
    data: await variantService.getPublicVariant(request.params.productId, request.params.variantId)
  });
}

export async function listAdminVariants(request, response) {
  response.status(200).json(
    await variantService.listAdminVariants(request.params.productId, request.query)
  );
}

export async function getAdminVariant(request, response) {
  response.status(200).json({
    data: await variantService.getAdminVariant(request.params.productId, request.params.variantId)
  });
}

export async function createVariant(request, response) {
  const variant = await variantService.createVariant(request.params.productId, request.body);
  response.location(`${request.baseUrl}/${request.params.productId}/variants/${variant.id}`);
  response.status(201).json({ data: variant });
}

export async function updateVariant(request, response) {
  response.status(200).json({
    data: await variantService.updateVariant(request.params.productId, request.params.variantId, request.body)
  });
}
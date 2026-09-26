import * as productService from "../services/product.service.js";

export async function listPublicProducts(request, response) {
  response.status(200).json(await productService.listPublicProducts(request.query));
}

export async function getPublicProduct(request, response) {
  response.status(200).json({
    data: await productService.getPublicProduct(request.params.productId)
  });
}

export async function listAdminProducts(request, response) {
  response.status(200).json(await productService.listAdminProducts(request.query));
}

export async function getAdminProduct(request, response) {
  response.status(200).json({
    data: await productService.getAdminProduct(request.params.productId)
  });
}

export async function createProduct(request, response) {
  const product = await productService.createProduct(request.body);
  response.location(`${request.baseUrl}/${product.id}`);
  response.status(201).json({ data: product });
}

export async function updateProduct(request, response) {
  response.status(200).json({
    data: await productService.updateProduct(request.params.productId, request.body)
  });
}
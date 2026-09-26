import * as categoryService from "../services/category.service.js";

export async function listPublicCategories(request, response) {
  response.status(200).json(await categoryService.listPublicCategories(request.query));
}

export async function getPublicCategory(request, response) {
  response.status(200).json({
    data: await categoryService.getPublicCategory(request.params.categoryId)
  });
}

export async function listAdminCategories(request, response) {
  response.status(200).json(await categoryService.listAdminCategories(request.query));
}

export async function getAdminCategory(request, response) {
  response.status(200).json({
    data: await categoryService.getAdminCategory(request.params.categoryId)
  });
}

export async function createCategory(request, response) {
  const category = await categoryService.createCategory(request.body);
  response.location(`${request.baseUrl}/${category.id}`);
  response.status(201).json({ data: category });
}

export async function updateCategory(request, response) {
  response.status(200).json({
    data: await categoryService.updateCategory(request.params.categoryId, request.body)
  });
}
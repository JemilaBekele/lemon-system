const httpStatus = require('http-status');
const ApiError = require('../utils/ApiError');
const prisma = require('./prisma');
const { uploadImage } = require('../utils/upload.util');

// Get Category by ID
const getCategoryById = async (id) => {
  const category = await prisma.category.findUnique({
    where: { id },
    include: {
      subCategories: true,
    },
  });
  return category;
};

// Get Category by Name
const getCategoryByName = async (name) => {
  const category = await prisma.category.findFirst({
    where: { name },
  });
  return category;
};

// Get all Categories
const getAllCategories = async () => {
  const categories = await prisma.category.findMany({
    orderBy: {
      name: 'asc',
    },
    include: {
      subCategories: true,
    },
  });
  // categories.forEach((cat) => {
  //   console.log(`📂 ${cat.name}`);
  //   cat.subCategories.forEach((sub) => {
  //     console.log(`   └─ 🧩 ${sub.name}`);
  //     console.log(`   └─ 🧩 ${sub.image}`);
  //   });
  // });
  return {
    categories,
    count: categories.length,
  };
};

const getSubCategoriesWithImages = async () => {
  const subcategories = await prisma.subCategory.findMany({
    where: {
      image: {
        not: null,
      },
    },
    orderBy: {
      name: 'asc',
    },
    select: {
      id: true,
      name: true,
      image: true,
      categoryId: true,
      category: {
        select: {
          name: true,
        },
      },
    },
  });

  // Optional nice console log (similar to your category log)
  subcategories.forEach((sub) => {
    console.log(`🧩 ${sub.name}`);
    console.log(`   └─ 🖼️ ${sub.image}`);
    console.log(`   └─ 📂 ${sub.category?.name}`);
  });

  return {
    subcategories,
    count: subcategories.length,
  };
};
const getCategoryByCode = async (code) => {
  const category = await prisma.category.findFirst({
    where: { code },
  });
  return category;
};
const generateUniqueCategoryCode = async () => {
  const prefix = 'CAT';

  // Fetch all existing category codes at once to avoid await in loop
  const existingCategories = await prisma.category.findMany({
    select: { code: true },
    where: {
      code: {
        startsWith: prefix,
      },
    },
  });

  // Extract numeric parts and find the maximum
  const existingNumbers = existingCategories
    .map((cat) => {
      const match = cat.code.match(/^CAT(\d+)$/);
      return match ? parseInt(match[1], 10) : 0;
    })
    .filter((num) => num > 0);

  // Start from the next available number
  const nextNumber =
    existingNumbers.length > 0 ? Math.max(...existingNumbers) + 1 : 1;

  if (nextNumber > 999) {
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Unable to generate unique category code - maximum limit reached',
    );
  }

  const code = `${prefix}${nextNumber.toString().padStart(3, '0')}`;
  return code;
};

// Create Category
const createCategory = async (categoryBody, files) => {
  const { name } = categoryBody;

  // Check if category with same name already exists
  if (await getCategoryByName(name)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Category name already exists');
  }

  // Generate code if not provided
  let { code } = categoryBody;
  if (!code || code.trim() === '') {
    code = await generateUniqueCategoryCode();
  } else if (await getCategoryByCode(code)) {
    // Check if code already exists
    throw new ApiError(httpStatus.BAD_REQUEST, 'Category code already exists');
  }

  let imageUrl = null;

  // Process the category image if provided
  const imageFile = Array.isArray(files?.image) ? files.image[0] : files?.image;

  if (imageFile) {
    try {
      imageUrl = await uploadImage(imageFile, 'category_images');
    } catch (err) {
      throw new ApiError(
        httpStatus.INTERNAL_SERVER_ERROR,
        'Category image processing failed',
      );
    }
  }

  // Convert string boolean to actual boolean
  // FormData sends boolean values as strings, so we need to convert them
  let isActive = true; // default value

  if (categoryBody.isActive !== undefined) {
    // Handle various string representations of boolean
    if (typeof categoryBody.isActive === 'string') {
      isActive = categoryBody.isActive.toLowerCase() === 'true';
    } else {
      isActive = Boolean(categoryBody.isActive);
    }
  }

  // Prepare category data
  const categoryData = {
    name: name.trim(),
    code,
    displayOrder: categoryBody.displayOrder
      ? parseInt(categoryBody.displayOrder, 10) || 0
      : 0,
    isActive,
  };

  // Add image URL if available
  if (imageUrl) {
    categoryData.image = imageUrl;
  }

  const category = await prisma.category.create({
    data: categoryData,
    include: {
      subCategories: true,
    },
  });

  return category;
};

// Update Category
const updateCategory = async (id, updateBody, files) => {
  const existingCategory = await getCategoryById(id);

  if (!existingCategory) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Category not found');
  }

  // Check if name is being updated and if it already exists
  if (updateBody.name && updateBody.name !== existingCategory.name) {
    const existingName = await getCategoryByName(updateBody.name);
    if (existingName) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Category name already exists',
      );
    }
  }

  // Handle code - generate if not provided or empty, check for duplicates if provided
  let { code } = updateBody;
  if (code !== undefined) {
    // If code is empty string or just whitespace, generate a new one
    if (!code || code.trim() === '') {
      code = await generateUniqueCategoryCode();
    }
    // If code is being changed and different from current code, check for duplicates
    else if (code !== existingCategory.code) {
      const existingCode = await getCategoryByCode(code);
      if (existingCode) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          'Category code already exists',
        );
      }
    }
  }
  // If category has no existing code and no code is being provided in update
  else if (!existingCategory.code) {
    code = await generateUniqueCategoryCode();
  }

  let imageUrl = existingCategory.image;

  // Process new image if provided
  const imageFile = Array.isArray(files?.image) ? files.image[0] : files?.image;

  if (imageFile) {
    try {
      imageUrl = await uploadImage(imageFile, 'category_images');
    } catch (err) {
      throw new ApiError(
        httpStatus.INTERNAL_SERVER_ERROR,
        'Category image processing failed',
      );
    }
  }

  // Prepare update data - convert string booleans/numbers
  const updateData = {};

  // Handle name
  if (updateBody.name !== undefined) {
    updateData.name = updateBody.name.trim();
  }

  // Handle code - always update if we have a code value
  if (code !== undefined) {
    updateData.code = code;
  }

  // Handle displayOrder - convert from string to number
  if (updateBody.displayOrder !== undefined) {
    updateData.displayOrder = parseInt(updateBody.displayOrder, 10) || 0;
  }

  // Handle isActive - convert from string to boolean
  if (updateBody.isActive !== undefined) {
    if (typeof updateBody.isActive === 'string') {
      updateData.isActive = updateBody.isActive.toLowerCase() === 'true';
    } else {
      updateData.isActive = Boolean(updateBody.isActive);
    }
  }

  // Handle image
  if (imageUrl !== undefined) {
    updateData.image = imageUrl;
  }

  try {
    const updatedCategory = await prisma.category.update({
      where: { id },
      data: updateData,
      include: {
        subCategories: true,
      },
    });
    return updatedCategory;
  } catch (error) {
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to update category',
    );
  }
};

// Delete Category
// Delete Category with error logging
// Delete Category and its subcategories (refused while it has products)
const deleteCategory = async (id) => {
  try {
    const existingCategory = await getCategoryById(id);
    if (!existingCategory) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Category not found');
    }

    // Products are not deleted from here: deleting them used to wipe their
    // sale lines, and products with sub-products, batches or history can no
    // longer be deleted by cascade. Products must be deleted (or moved) first.
    const productCount = await prisma.product.count({
      where: { categoryId: id },
    });
    if (productCount > 0) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Category still has ${productCount} product(s). Delete or move them to another category first.`,
      );
    }

    await prisma.$transaction([
      // Delete all subcategories
      prisma.subCategory.deleteMany({
        where: { categoryId: id },
      }),

      // Finally delete the category
      prisma.category.delete({
        where: { id },
      }),
    ]);

    console.log(
      `[DELETE CATEGORY] Category and related data deleted, id: ${id}`,
    );
    return {
      message: 'Category and its subcategories deleted successfully',
    };
  } catch (error) {
    console.error('[DELETE CATEGORY] Error:', error);
    throw error;
  }
};

// SubCategory Services

// Get SubCategory by ID
const getSubCategoryById = async (id) => {
  const subCategory = await prisma.subCategory.findUnique({
    where: { id },
    include: {
      category: true,
    },
  });
  return subCategory;
};

// Get SubCategory by Name and Category ID
const getSubCategoriesByCategory = async (categoryId) => {
  try {
    const subCategories = await prisma.subCategory.findMany({
      where: {
        categoryId,
      },
      select: {
        id: true,
        name: true,
        code: true,
        image: true,
        categoryId: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: {
        name: 'asc', // Optional: order by name alphabetically
      },
    });
    return {
      subCategories,
      count: subCategories.length,
    };
  } catch (error) {
    throw new Error('Failed to fetch subcategories');
  }
};
const getAllSubCategories = async () => {
  const subcategories = await prisma.subCategory.findMany({
    orderBy: {
      name: 'asc',
    },
    select: {
      id: true,
      name: true,
      code: true,
      image: true, // ✅ EXPLICIT
      isActive: true,
      displayOrder: true,
      createdAt: true,
      updatedAt: true,
      category: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });
  return {
    subcategories,
    count: subcategories.length,
  };
};

const getProductsBySubCategoryId = async (subCategoryId) => {
  // Get all products with the specified subcategory ID
  const products = await prisma.product.findMany({
    where: {
      subCategoryId,
      isActive: true, // Only include active products
      // Only include products that have stock in shops
      batches: {
        some: {
          ShopStock: {
            some: {
              quantity: {
                gt: 0, // Only batches with available quantity in shops
              },
            },
          },
        },
      },
    },
    include: {
      category: true,
      subCategory: true,
      unitOfMeasure: true,
    },
    orderBy: {
      name: 'asc', // Order by product name alphabetically
    },
  });

  // Return only the product information
  return {
    products,
    count: products.length,
  };
};
// Get all SubCategories by Category ID
const getSubCategoryByNameAndCategory = async () => {
  const subCategories = await prisma.subCategory.findMany({
    orderBy: {
      name: 'asc',
    },
    include: {
      category: true,
    },
  });

  return {
    subCategories,
    count: subCategories.length,
  };
};

const getSubCategoryByCode = async (code) => {
  const subCategory = await prisma.subCategory.findFirst({
    where: { code },
  });
  return subCategory;
};

// Generate unique subcategory code
const generateUniqueSubCategoryCode = async () => {
  const prefix = 'SUB';
  // Fetch all existing subcategory codes at once
  const existingCodes = await prisma.subCategory.findMany({
    select: { code: true },
  });
  const codeSet = new Set(existingCodes.map((sc) => sc.code));
  let code;
  let counter = 1;

  while (counter <= 999) {
    code = `${prefix}${counter.toString().padStart(3, '0')}`;
    if (!codeSet.has(code)) {
      return code;
    }
    counter += 1;
  }

  throw new ApiError(
    httpStatus.INTERNAL_SERVER_ERROR,
    'Unable to generate unique subcategory code',
  );
};
// Create SubCategory
const createSubCategory = async (subCategoryBody, files) => {
  const { name, categoryId } = subCategoryBody;

  // Check if category exists
  const category = await getCategoryById(categoryId);
  if (!category) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Category not found');
  }

  // Check if subcategory with same name already exists in this category
  const existingSubCategoryResult = await getSubCategoryByNameAndCategory(
    name,
    categoryId,
  );

  // FIX: Check if we actually found a subcategory with this name in this category
  let duplicateFound = false;
  if (existingSubCategoryResult) {
    // Check if the result has a subCategories array
    if (
      existingSubCategoryResult.subCategories &&
      Array.isArray(existingSubCategoryResult.subCategories)
    ) {
      // Look for a subcategory with the exact name in the specified category
      duplicateFound = existingSubCategoryResult.subCategories.some(
        (subCategory) =>
          subCategory.name === name && subCategory.categoryId === categoryId,
      );
    } else if (
      existingSubCategoryResult.name &&
      existingSubCategoryResult.categoryId
    ) {
      // If it's a single subcategory object
      duplicateFound =
        existingSubCategoryResult.name === name &&
        existingSubCategoryResult.categoryId === categoryId;
    }
  }

  if (duplicateFound) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'SubCategory name already exists in this category',
    );
  }

  // Generate code if not provided
  let { code } = subCategoryBody;

  if (!code || code.trim() === '') {
    code = await generateUniqueSubCategoryCode();
  } else {
    // Check if code already exists
    const existingCodeResult = await getSubCategoryByCode(code);
    let codeExists = false;
    if (existingCodeResult) {
      // Handle similar structure for code check
      if (
        existingCodeResult.subCategories &&
        Array.isArray(existingCodeResult.subCategories)
      ) {
        codeExists = existingCodeResult.subCategories.some(
          (subCategory) => subCategory.code === code,
        );
      } else if (existingCodeResult.code) {
        codeExists = existingCodeResult.code === code;
      }
    }

    if (codeExists) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'SubCategory code already exists',
      );
    }
  }

  // ... rest of the code remains the same
  let imageUrl = null;

  // Process the subcategory image if provided
  const imageFile = Array.isArray(files?.image) ? files.image[0] : files?.image;

  if (imageFile) {
    try {
      imageUrl = await uploadImage(imageFile, 'subcategory_images');
    } catch (err) {
      throw new ApiError(
        httpStatus.INTERNAL_SERVER_ERROR,
        'SubCategory image processing failed',
      );
    }
  } else {
    console.log('No image file provided');
  }

  // Convert string boolean to actual boolean
  let isActive = true; // default value

  if (subCategoryBody.isActive !== undefined) {
    if (typeof subCategoryBody.isActive === 'string') {
      isActive = subCategoryBody.isActive.toLowerCase() === 'true';
    } else {
      isActive = Boolean(subCategoryBody.isActive);
    }
  }

  // Prepare subcategory data
  const subCategoryData = {
    name: name.trim(),
    code,
    categoryId,
    displayOrder: subCategoryBody.displayOrder
      ? parseInt(subCategoryBody.displayOrder, 10) || 0
      : 0,
    isActive,
  };

  // Add image URL if available
  if (imageUrl) {
    subCategoryData.image = imageUrl;
  }
  try {
    const subCategory = await prisma.subCategory.create({
      data: subCategoryData,
      include: {
        category: true,
      },
    });
    return subCategory;
  } catch (error) {
    // Re-throw the error or handle it as needed
    if (error instanceof ApiError) {
      throw error;
    } else {
      // Wrap non-ApiError in ApiError
      throw new ApiError(
        httpStatus.INTERNAL_SERVER_ERROR,
        'Failed to create subcategory',
      );
    }
  }
};

// Update SubCategory
const updateSubCategory = async (id, updateBody, files) => {
  const existingSubCategory = await getSubCategoryById(id);

  if (!existingSubCategory) {
    throw new ApiError(httpStatus.NOT_FOUND, 'SubCategory not found');
  }

  // Check if name is being updated to an existing subcategory name in the same category
  const categoryId = updateBody.categoryId || existingSubCategory.categoryId;

  if (updateBody.name && updateBody.name !== existingSubCategory.name) {
    const duplicateCheck = await getSubCategoryByNameAndCategory(
      updateBody.name,
      categoryId,
    );

    let duplicateFound = false;
    if (duplicateCheck) {
      // Handle the structure from getSubCategoryByNameAndCategory
      if (
        duplicateCheck.subCategories &&
        Array.isArray(duplicateCheck.subCategories)
      ) {
        duplicateFound = duplicateCheck.subCategories.some(
          (subCategory) =>
            subCategory.name === updateBody.name &&
            subCategory.categoryId === categoryId,
        );
      } else if (duplicateCheck.name && duplicateCheck.categoryId) {
        duplicateFound =
          duplicateCheck.name === updateBody.name &&
          duplicateCheck.categoryId === categoryId;
      }
    }

    if (duplicateFound) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'SubCategory name already exists in this category',
      );
    }
  }

  // Handle code with the improved logic
  let { code } = updateBody;

  if (code !== undefined) {
    // If code is provided and it's empty/whitespace → generate new code
    if (!code || code.trim() === '') {
      code = await generateUniqueSubCategoryCode();
    }
    // If code is provided and different from existing → check for duplicates
    else if (code !== existingSubCategory.code) {
      const existingCodeResult = await getSubCategoryByCode(code);

      let codeExists = false;
      if (existingCodeResult) {
        // Handle similar structure for code check
        if (
          existingCodeResult.subCategories &&
          Array.isArray(existingCodeResult.subCategories)
        ) {
          codeExists = existingCodeResult.subCategories.some(
            (subCategory) => subCategory.code === code,
          );
        } else if (existingCodeResult.code) {
          codeExists = existingCodeResult.code === code;
        }
      }

      if (codeExists) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          'SubCategory code already exists',
        );
      }
    }
  }
  // If code is not provided in update but subcategory has no existing code → generate new code
  else if (!existingSubCategory.code) {
    code = await generateUniqueSubCategoryCode();
  }
  // If code is not provided and subcategory already has a code → keep existing code
  // In this case, code remains undefined and we won't update the code field

  // If changing category, verify new category exists
  if (
    updateBody.categoryId &&
    updateBody.categoryId !== existingSubCategory.categoryId
  ) {
    const newCategory = await getCategoryById(updateBody.categoryId);
    if (!newCategory) {
      throw new ApiError(httpStatus.NOT_FOUND, 'New category not found');
    }
  }

  let imageUrl = existingSubCategory.image;

  // Process new image if provided
  const imageFile = Array.isArray(files?.image) ? files.image[0] : files?.image;

  if (imageFile) {
    try {
      imageUrl = await uploadImage(imageFile, 'subcategory_images');
    } catch (err) {
      throw new ApiError(
        httpStatus.INTERNAL_SERVER_ERROR,
        'SubCategory image processing failed',
      );
    }
  }

  // Prepare update data - convert string booleans/numbers
  const updateData = {};

  // Handle name
  if (updateBody.name !== undefined) {
    updateData.name = updateBody.name.trim();
  }

  // Handle code - only update if we have a code value (either from input or generated)
  if (code !== undefined) {
    updateData.code = code;
  }

  // Handle categoryId
  if (updateBody.categoryId !== undefined) {
    updateData.categoryId = updateBody.categoryId;
  }

  // Handle displayOrder - convert from string to number
  if (updateBody.displayOrder !== undefined) {
    updateData.displayOrder = parseInt(updateBody.displayOrder, 10) || 0;
  }

  // Handle isActive - convert from string to boolean
  if (updateBody.isActive !== undefined) {
    if (typeof updateBody.isActive === 'string') {
      updateData.isActive = updateBody.isActive.toLowerCase() === 'true';
    } else {
      updateData.isActive = Boolean(updateBody.isActive);
    }
  }

  // Handle image
  if (imageUrl !== undefined) {
    updateData.image = imageUrl;
  }

  try {
    const updatedSubCategory = await prisma.subCategory.update({
      where: { id },
      data: updateData,
      include: {
        category: true,
      },
    });

    return updatedSubCategory;
  } catch (error) {
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to update subcategory',
    );
  }
};

// Delete SubCategory
const deleteSubCategory = async (id) => {
  const existingSubCategory = await getSubCategoryById(id);
  if (!existingSubCategory) {
    throw new ApiError(httpStatus.NOT_FOUND, 'SubCategory not found');
  }

  await prisma.subCategory.delete({
    where: { id },
  });

  return { message: 'SubCategory deleted successfully' };
};
const getProductsWithImages = async () => {
  try {
    console.log('Fetching products...');

    const products = await prisma.product.findMany({
      where: {
        imageUrl: {
          not: '',
        },
      },
      orderBy: {
        name: 'asc',
      },
      select: {
        id: true,
        name: true,
        productCode: true,
        imageUrl: true,
        categoryId: true,
        category: {
          select: { name: true },
        },
        unitOfMeasure: {
          select: {
            name: true,
            symbol: true,
          },
        },
      },
    });


    products.slice(0, 5).forEach((p) => {
      console.log(`📦 ${p.name} (${p.productCode})`);
      console.log(`   └─ 🖼️ ${p.imageUrl}`);
    });

    return {
      products,
      count: products.length,
    };
  } catch (error) {
    console.error(error);
    throw error;
  }
};

const getProducts = async () => {
  const products = await prisma.product.findMany({
    orderBy: {
      name: 'asc',
    },
    select: {
      id: true,
      name: true,
      productCode: true,
      imageUrl: true,
      generic: true,
      categoryId: true,

      category: {
        select: {
          name: true,
        },
      },
      subCategory: {
        select: {
          name: true,
        },
      },
      subProducts: true,
      unitOfMeasure: {
        select: {
          id: true,
          name: true,
          symbol: true,
          base: true,
        },
      },
    },
  });

  return {
    products,
    count: products.length,
  };
};

module.exports = {
  getCategoryById,
  getCategoryByName,
  getAllCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  getSubCategoryById,
  getSubCategoryByNameAndCategory,
  getSubCategoriesByCategory,
  getProductsBySubCategoryId,
  createSubCategory,
  updateSubCategory,
  deleteSubCategory,
  getAllSubCategories,
  getSubCategoriesWithImages,
  getProductsWithImages,
  getProducts,
};

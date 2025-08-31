import { faker } from "@faker-js/faker";

export const createPost = (post_type: "text" | "heat_check" | "intel_report") => {
    const basePost = {
        id: faker.string.uuid(),
        author: {
            name: faker.internet.userName(),
            avatarUrl: faker.image.avatar(),
        },
        distance: `${faker.number.float({ min: 0.1, max: 5, precision: 0.1 })} mi`,
        timestamp: `${faker.number.int({ min: 1, max: 59 })}m ago`,
        karma: faker.number.int({ min: 0, max: 1000 }),
    };

    if (post_type === "text") {
        return {
            ...basePost,
            post_type,
            content: faker.lorem.paragraph(),
        };
    }

    if (post_type === "heat_check") {
        return {
            ...basePost,
            post_type,
            images: Array.from({ length: faker.number.int({ min: 1, max: 5 }) }, () =>
                faker.image.url()
            ),
        };
    }

    if (post_type === "intel_report") {
        return {
            ...basePost,
            post_type,
            store: faker.company.name(),
            model: faker.commerce.productName(),
            sizes: "9, 10, 11",
            price: faker.commerce.price(),
        };
    }

    return basePost;
};

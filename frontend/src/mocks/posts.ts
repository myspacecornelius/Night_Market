export const posts = [
    {
        id: "1",
        post_type: "text",
        author: {
            name: "John Doe",
            avatarUrl: "https://github.com/shadcn.png",
        },
        distance: "0.5 mi",
        timestamp: "10m ago",
        content: "This is a text post.",
        karma: 10,
    },
    {
        id: "2",
        post_type: "heat_check",
        author: {
            name: "Jane Doe",
        },
        distance: "1.2 mi",
        timestamp: "30m ago",
        images: [
            "https://via.placeholder.com/400",
            "https://via.placeholder.com/400",
            "https://via.placeholder.com/400",
        ],
        karma: 25,
    },
    {
        id: "3",
        post_type: "intel_report",
        author: {
            name: "Anon",
        },
        distance: "2.1 mi",
        timestamp: "1h ago",
        store: "Nike Store",
        model: "Air Max 90",
        sizes: "9, 10, 11",
        price: "$120",
        karma: 50,
    },
];

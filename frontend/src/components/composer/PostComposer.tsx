import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogFooter,
    DialogClose,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Image as ImageIcon, MapPin } from "lucide-react";
import React, { useState, useRef } from "react";
import { Badge } from "@/components/ui/Badge";

// TODO(api): This should be passed from a user session or context
const MOCK_USER_LOCATION = "Brooklyn, NY (2 mi away)";

interface PostComposerProps {
    onSave: (post: any) => void;
}

export const PostComposer: React.FC<PostComposerProps> = ({ onSave }) => {
    const [postType, setPostType] = useState("text");
    const [text, setText] = useState("");
    const [images, setImages] = useState<string[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        if (event.target.files) {
            const files = Array.from(event.target.files);
            const newImageUrls = files.map(file => URL.createObjectURL(file as Blob));
            setImages(prev => [...prev, ...newImageUrls]);
        }
    };

    const handleSave = () => {
        // TODO(api): This would be a proper API call
        const newPost = {
            id: `new-${Date.now()}`,
            type: postType,
            author: {
                name: "You",
                avatarUrl: "https://i.pravatar.cc/150?u=a042581f4e29026704d",
                isAnon: false,
            },
            content: text,
            images: postType === 'heat-check' ? images : [],
            distance: "Just now",
            timestamp: new Date().toISOString(),
            karma: 0,
        };
        onSave(newPost);
        // Reset state after saving
        setText("");
        setImages([]);
    };

    return (
        <Dialog>
            <DialogTrigger asChild>
                <Button className="w-full">Create Post</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Create a new post</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <Tabs value={postType} onValueChange={setPostType} className="w-full">
                        <TabsList className="grid w-full grid-cols-2">
                            <TabsTrigger value="text">Text Post</TabsTrigger>
                            <TabsTrigger value="heat-check">Heat Check</TabsTrigger>
                        </TabsList>
                        <TabsContent value="text" className="mt-4">
                            <Textarea
                                placeholder="What's on your mind?"
                                value={text}
                                onChange={(e) => setText(e.target.value)}
                                className="min-h-[120px]"
                                aria-label="Post content"
                            />
                        </TabsContent>
                        <TabsContent value="heat-check" className="mt-4">
                            <Textarea
                                placeholder="Add a caption..."
                                value={text}
                                onChange={(e) => setText(e.target.value)}
                                className="min-h-[80px]"
                                aria-label="Image caption"
                            />
                            <div className="mt-2 flex items-center gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => fileInputRef.current?.click()}
                                    aria-label="Add images"
                                >
                                    <ImageIcon className="mr-2 h-4 w-4" />
                                    Add Images
                                </Button>
                                <input
                                    type="file"
                                    ref={fileInputRef}
                                    className="hidden"
                                    multiple
                                    accept="image/*"
                                    onChange={handleImageChange}
                                />
                            </div>
                            {images.length > 0 && (
                                <div className="mt-4 grid grid-cols-3 gap-2">
                                    {images.map((src, index) => (
                                        <img key={index} src={src} alt={`preview ${index}`} className="rounded-md object-cover aspect-square" />
                                    ))}
                                </div>
                            )}
                        </TabsContent>
                    </Tabs>
                    <div className="flex items-center justify-start">
                        <Badge variant="outline">
                            <MapPin className="mr-1 h-3 w-3" />
                            {MOCK_USER_LOCATION}
                        </Badge>
                    </div>
                </div>
                <DialogFooter>
                    <DialogClose asChild>
                        <Button type="submit" onClick={handleSave} disabled={!text.trim()}>Post</Button>
                    </DialogClose>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
